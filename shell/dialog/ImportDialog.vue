<script>
import { mapGetters } from 'vuex';
import { Card } from '@components/Card';
import { Banner } from '@components/Banner';
import YamlEditor from '@shell/components/YamlEditor';
import FileSelector from '@shell/components/form/FileSelector';
import AsyncButton from '@shell/components/AsyncButton';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import SortableTable from '@shell/components/SortableTable';
import { sortBy } from '@shell/utils/sort';
import { exceptionToErrorsArray } from '@shell/utils/error';
import { NAMESPACE } from '@shell/config/types';
import { NAME as NAME_COL, TYPE, NAMESPACE as NAMESPACE_COL, AGE } from '@shell/config/table-headers';
import {
  isNotFoundError,
  resourceIdentity,
  resourcesFromYaml,
  resourceType
} from '@shell/utils/import-yaml';

export default {
  emits: ['close', 'onReadyYamlEditor'],

  components: {
    AsyncButton,
    Banner,
    Card,
    YamlEditor,
    FileSelector,
    LabeledSelect,
    SortableTable
  },

  props: {
    defaultNamespace: {
      type:    String,
      default: undefined
    },
  },

  async fetch() {
    this.allNamespaces = (await this.$store.dispatch('cluster/findAll', { type: NAMESPACE, opt: { url: 'namespaces' } })) || [];

    if (this.selectedNamespace === undefined) {
      const defaultNamespace = 'default';
      const hasAccessToDefaultNamespace = this.allNamespaces.some((ns) => ns.name === defaultNamespace);

      this.selectedNamespace = hasAccessToDefaultNamespace ? defaultNamespace : this.allNamespaces[0]?.name;
    }
  },

  data() {
    return {
      currentYaml:       '',
      allNamespaces:     [],
      errors:            null,
      rows:              null,
      done:              false,
      preflight:         null,
      preflightYaml:     null,
      selectedNamespace: this.defaultNamespace,
    };
  },

  computed: {
    ...mapGetters(['currentCluster']),

    namespaceOptions() {
      const out = this.allNamespaces.map((obj) => {
        return {
          label: obj.name,
          value: obj.name,
        };
      });

      return sortBy(out, 'label');
    },

    headers() {
      return [
        TYPE,
        NAME_COL,
        NAMESPACE_COL,
        AGE
      ];
    },

    showPreflightConfirmation() {
      return this.preflightYaml === this.currentYaml &&
        !!(this.preflight?.existing.length || this.preflight?.unchecked.length);
    },
  },

  watch: {
    currentYaml() {
      this.resetPreflight();
    },

    selectedNamespace() {
      this.resetPreflight();
    },
  },

  methods: {
    close() {
      this.$emit('close');
    },

    onFileSelected(value) {
      const component = this.$refs.yamleditor;

      if (component) {
        this.errors = null;
        component.updateValue(value);
      }
    },

    resetPreflight() {
      this.preflight = null;
      this.preflightYaml = null;
    },

    async preflightImport() {
      const existing = [];
      const unchecked = [];
      const resources = resourcesFromYaml(this.currentYaml);

      await Promise.all(resources.map(async(resource) => {
        const type = resourceType(resource);
        const schema = type ? this.$store.getters['cluster/schemaFor'](type, false, false) : null;
        const identity = resourceIdentity(resource, schema, this.selectedNamespace);

        if (!identity) {
          return;
        }

        if (!schema || (schema.attributes?.namespaced && !identity.namespace)) {
          unchecked.push(identity);

          return;
        }

        try {
          const found = await this.$store.dispatch('cluster/find', {
            type,
            id:  identity.id,
            opt: {
              force:     true,
              transient: true,
              watch:     false,
            },
          });

          if (found) {
            existing.push(identity);
          }
        } catch (err) {
          if (!isNotFoundError(err)) {
            unchecked.push(identity);
          }
        }
      }));

      const byIdentity = (a, b) => `${ a.type }/${ a.id }`.localeCompare(`${ b.type }/${ b.id }`);
      const unique = (resources) => [
        ...new Map(resources.map((resource) => [`${ resource.type }/${ resource.id }`, resource])).values()
      ];

      return {
        existing:  unique(existing).sort(byIdentity),
        unchecked: unique(unchecked).sort(byIdentity),
      };
    },

    resourceLabel(resource) {
      return resource.namespace ? `${ resource.namespace }/${ resource.name }` : resource.name;
    },

    async importYaml(btnCb) {
      try {
        this.errors = [];

        if (!this.showPreflightConfirmation) {
          const preflight = await this.preflightImport();

          if (preflight.existing.length || preflight.unchecked.length) {
            this.preflight = preflight;
            this.preflightYaml = this.currentYaml;
            btnCb('cancelled');

            return;
          }
        }

        const res = await this.currentCluster.doAction('apply', {
          yaml:             this.currentYaml,
          defaultNamespace: this.selectedNamespace,
        });

        btnCb(true);

        this.rows = res;
        this.done = true;
        this.resetPreflight();
      } catch (err) {
        this.errors = exceptionToErrorsArray(err);
        this.done = false;
        this.resetPreflight();
        btnCb(false);
      }
    },

    rowClick(e) {
      if ( e.target.tagName === 'A' ) {
        this.close();
      }
    },

    onReadyYamlEditor(arg) {
      this.$emit('onReadyYamlEditor', arg);
    }
  },
};
</script>

<template>
  <Card
    :show-highlight-border="false"
    data-testid="import-yaml"
  >
    <template #title>
      <div style="display: block; width: 100%;">
        <template v-if="done">
          <h4 data-testid="import-yaml-success">
            {{ t('import.success', {count: rows.length}) }}
          </h4>
        </template>
        <template v-else>
          <h4 v-t="'import.title'" />
          <div class="row">
            <div class="col span-6">
              <FileSelector
                :aria-label="t('generic.readFromFileArea', { area: t('import.title') })"
                variant="secondary"
                class="pull-left"
                :label="t('generic.readFromFile')"
                @selected="onFileSelected"
              />
            </div>
            <div class="col span-6">
              <LabeledSelect
                v-model:value="selectedNamespace"
                :options="namespaceOptions"
                label-key="import.defaultNamespace.label"
                mode="edit"
              />
            </div>
          </div>
        </template>
      </div>
    </template>
    <template #body>
      <template v-if="done">
        <div class="results">
          <SortableTable
            :rows="rows"
            :headers="headers"
            mode="view"
            key-field="_key"
            :search="false"
            :paging="true"
            :row-actions="false"
            :table-actions="false"
            :sub-rows-description="false"
            @rowClick="rowClick"
          />
        </div>
      </template>
      <YamlEditor
        v-else
        ref="yamleditor"
        v-model:value="currentYaml"
        class="yaml-editor"
        @onReady="onReadyYamlEditor"
      />
      <Banner
        v-if="showPreflightConfirmation"
        color="warning"
        role="status"
        data-testid="import-yaml-update-warning"
      >
        <div class="preflight-warning">
          <p v-if="preflight.existing.length">
            {{ t('import.confirmation.existing', {count: preflight.existing.length}) }}
          </p>
          <ul
            v-if="preflight.existing.length"
            data-testid="import-yaml-existing-resources"
          >
            <li
              v-for="resource in preflight.existing"
              :key="`${resource.type}/${resource.id}`"
            >
              <code>{{ resource.kind }} {{ resourceLabel(resource) }}</code>
            </li>
          </ul>
          <p v-if="preflight.unchecked.length">
            {{ t('import.confirmation.unchecked', {count: preflight.unchecked.length}) }}
          </p>
          <ul
            v-if="preflight.unchecked.length"
            data-testid="import-yaml-unchecked-resources"
          >
            <li
              v-for="resource in preflight.unchecked"
              :key="`${resource.type}/${resource.id}`"
            >
              <code>{{ resource.kind }} {{ resourceLabel(resource) }}</code>
            </li>
          </ul>
          <p>{{ t('import.confirmation.prompt') }}</p>
        </div>
      </Banner>
      <Banner
        v-for="(err, i) in errors"
        :key="i"
        color="error"
        role="alert"
        :label="err"
      />
    </template>
    <template #actions>
      <div
        v-if="done"
        class="text-center"
        style="width: 100%"
      >
        <button
          :aria-label="t('generic.close')"
          role="button"
          type="button"
          class="btn role-primary"
          data-testid="import-yaml-close"
          @click="close"
        >
          {{ t('generic.close') }}
        </button>
      </div>
      <div
        v-else
        class="text-center"
        style="width: 100%"
      >
        <button
          :aria-label="t('generic.cancel')"
          role="button"
          type="button"
          class="btn role-secondary mr-10"
          data-testid="import-yaml-cancel"
          @click="close"
        >
          {{ t('generic.cancel') }}
        </button>
        <AsyncButton
          v-if="!done"
          mode="import"
          :disabled="!currentYaml.length"
          :action-label="showPreflightConfirmation ? t('import.confirmation.action') : null"
          data-testid="import-yaml-import-action"
          :aria-label="showPreflightConfirmation ? t('import.confirmation.action') : t('import.title')"
          @click="importYaml"
        />
      </div>
    </template>
  </Card>
</template>

<style lang='scss' scoped>
  $min: 50vh;
  $max: 50vh;

  .yaml-editor {
    flex: 1;
    min-height: $min;
    max-height: $max;

    :deep() .code-mirror {
      .CodeMirror {
        position: initial;
      }

      .CodeMirror,
      .CodeMirror-scroll,
      .CodeMirror-gutters {
        min-height: $min;
        max-height: $max;
      }
    }
  }

  .preflight-warning {
    width: 100%;

    p:last-child {
      margin-bottom: 0;
    }
  }
</style>
