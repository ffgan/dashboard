import { shallowMount } from '@vue/test-utils';
import ImportDialog from '@shell/dialog/ImportDialog.vue';

const ingressYaml = `
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: example
`;

const ingressSchema = {
  id:         'networking.k8s.io.ingress',
  attributes: { namespaced: true },
};

const stubs = {
  AsyncButton:   true,
  Banner:        true,
  Card:          true,
  FileSelector:  true,
  LabeledSelect: true,
  SortableTable: true,
  YamlEditor:    true,
};

function createWrapper({
  find = jest.fn(),
  schemaFor = jest.fn(() => ingressSchema),
  apply = jest.fn().mockResolvedValue([]),
} = {}) {
  const dispatch = jest.fn((action, payload) => {
    if (action === 'cluster/find') {
      return find(payload);
    }

    return Promise.resolve([]);
  });

  return shallowMount(ImportDialog, {
    global: {
      mocks: {
        $store: {
          dispatch,
          getters: {
            currentCluster:      { doAction: apply },
            'cluster/schemaFor': schemaFor,
          },
        },
        t: jest.fn((key: string) => key),
      },
      stubs,
    },
  });
}

describe('component: ImportDialog', () => {
  it('requires confirmation before applying YAML that updates an existing resource', async() => {
    const find = jest.fn().mockResolvedValue({ id: 'default/example' });
    const schemaFor = jest.fn(() => ingressSchema);
    const apply = jest.fn().mockResolvedValue([]);
    const wrapper = createWrapper({
      find, schemaFor, apply
    });
    const buttonDone = jest.fn();

    wrapper.vm.currentYaml = ingressYaml;
    wrapper.vm.selectedNamespace = 'default';
    await wrapper.vm.$nextTick();
    await wrapper.vm.importYaml(buttonDone);

    expect(find).toHaveBeenCalledWith(expect.objectContaining({
      type: 'networking.k8s.io.ingress',
      id:   'default/example',
    }));
    expect(schemaFor).toHaveBeenCalledWith('networking.k8s.io.ingress', false, false);
    expect(wrapper.vm.preflight.existing).toHaveLength(1);
    expect(wrapper.vm.showPreflightConfirmation).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(buttonDone).toHaveBeenCalledWith('cancelled');

    await wrapper.vm.importYaml(buttonDone);

    expect(apply).toHaveBeenCalledWith('apply', {
      yaml:             ingressYaml,
      defaultNamespace: 'default',
    });
    expect(buttonDone).toHaveBeenLastCalledWith(true);
  });

  it('applies immediately when all named resources are new', async() => {
    const notFound = Object.assign(new Error('Not found'), { status: 404 });
    const find = jest.fn().mockRejectedValue(notFound);
    const apply = jest.fn().mockResolvedValue([]);
    const wrapper = createWrapper({ find, apply });
    const buttonDone = jest.fn();

    wrapper.vm.currentYaml = ingressYaml;
    wrapper.vm.selectedNamespace = 'default';
    await wrapper.vm.$nextTick();
    await wrapper.vm.importYaml(buttonDone);

    expect(wrapper.vm.showPreflightConfirmation).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(buttonDone).toHaveBeenCalledWith(true);
  });

  it('requires confirmation when a resource cannot be checked', async() => {
    const schemaFor = jest.fn(() => undefined);
    const apply = jest.fn().mockResolvedValue([]);
    const wrapper = createWrapper({ schemaFor, apply });
    const buttonDone = jest.fn();

    wrapper.vm.currentYaml = ingressYaml;
    wrapper.vm.selectedNamespace = 'default';
    await wrapper.vm.$nextTick();
    await wrapper.vm.importYaml(buttonDone);

    expect(wrapper.vm.preflight.unchecked).toHaveLength(1);
    expect(wrapper.vm.showPreflightConfirmation).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(buttonDone).toHaveBeenCalledWith('cancelled');
  });

  it('requires confirmation when the existence check is forbidden', async() => {
    const forbidden = Object.assign(new Error('Forbidden'), { status: 403 });
    const find = jest.fn().mockRejectedValue(forbidden);
    const apply = jest.fn().mockResolvedValue([]);
    const wrapper = createWrapper({ find, apply });
    const buttonDone = jest.fn();

    wrapper.vm.currentYaml = ingressYaml;
    wrapper.vm.selectedNamespace = 'default';
    await wrapper.vm.$nextTick();
    await wrapper.vm.importYaml(buttonDone);

    expect(wrapper.vm.preflight.unchecked).toHaveLength(1);
    expect(wrapper.vm.showPreflightConfirmation).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(buttonDone).toHaveBeenCalledWith('cancelled');
  });

  it('clears confirmation when the YAML changes', async() => {
    const find = jest.fn().mockResolvedValue({ id: 'default/example' });
    const wrapper = createWrapper({ find });

    wrapper.vm.currentYaml = ingressYaml;
    wrapper.vm.selectedNamespace = 'default';
    await wrapper.vm.$nextTick();
    await wrapper.vm.importYaml(jest.fn());

    expect(wrapper.vm.showPreflightConfirmation).toBe(true);

    wrapper.vm.currentYaml = ingressYaml.replace('example', 'changed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.preflight).toBeNull();
    expect(wrapper.vm.showPreflightConfirmation).toBe(false);
  });

  it('reports invalid YAML without calling apply', async() => {
    const apply = jest.fn().mockResolvedValue([]);
    const wrapper = createWrapper({ apply });
    const buttonDone = jest.fn();

    wrapper.vm.currentYaml = 'metadata: [';
    await wrapper.vm.$nextTick();
    await wrapper.vm.importYaml(buttonDone);

    expect(wrapper.vm.errors).toHaveLength(1);
    expect(apply).not.toHaveBeenCalled();
    expect(buttonDone).toHaveBeenCalledWith(false);
  });
});
