import {
  isNotFoundError,
  resourceIdentity,
  resourcesFromYaml,
  resourceType
} from '@shell/utils/import-yaml';

describe('import YAML utilities', () => {
  describe('resourcesFromYaml', () => {
    it('parses multiple documents and ignores empty documents', () => {
      const resources = resourcesFromYaml(`
apiVersion: v1
kind: ConfigMap
metadata:
  name: first
---
---
apiVersion: v1
kind: Secret
metadata:
  name: second
`);

      expect(resources.map((resource) => resource.metadata.name)).toStrictEqual(['first', 'second']);
    });

    it('flattens Kubernetes List documents', () => {
      const resources = resourcesFromYaml(`
apiVersion: v1
kind: List
items:
  - apiVersion: v1
    kind: ConfigMap
    metadata:
      name: first
  - apiVersion: v1
    kind: ConfigMap
    metadata:
      name: second
`);

      expect(resources.map((resource) => resource.metadata.name)).toStrictEqual(['first', 'second']);
    });
  });

  describe('resourceType', () => {
    it.each([
      [{ apiVersion: 'v1', kind: 'ConfigMap' }, 'configmap'],
      [{ apiVersion: 'networking.k8s.io/v1', kind: 'Ingress' }, 'networking.k8s.io.ingress'],
      [{ kind: 'Pod' }, 'pod'],
    ])('maps Kubernetes resources to Steve types', (resource, expected) => {
      expect(resourceType(resource)).toBe(expected);
    });
  });

  describe('resourceIdentity', () => {
    it('uses the selected default namespace for namespaced resources', () => {
      const resource = {
        apiVersion: 'networking.k8s.io/v1',
        kind:       'Ingress',
        metadata:   { name: 'example' },
      };
      const schema = { attributes: { namespaced: true } };

      expect(resourceIdentity(resource, schema, 'default')).toStrictEqual({
        id:        'default/example',
        kind:      'Ingress',
        name:      'example',
        namespace: 'default',
        type:      'networking.k8s.io.ingress',
      });
    });

    it('does not add a namespace to cluster-scoped resources', () => {
      const resource = {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind:       'ClusterRole',
        metadata:   { name: 'example' },
      };
      const schema = { attributes: { namespaced: false } };

      expect(resourceIdentity(resource, schema, 'default')).toStrictEqual({
        id:        'example',
        kind:      'ClusterRole',
        name:      'example',
        namespace: undefined,
        type:      'rbac.authorization.k8s.io.clusterrole',
      });
    });

    it('skips resources without a fixed name', () => {
      const resource = {
        apiVersion: 'v1',
        kind:       'Pod',
        metadata:   { generateName: 'example-' },
      };

      expect(resourceIdentity(resource, { attributes: { namespaced: true } }, 'default')).toBeNull();
    });
  });

  describe('isNotFoundError', () => {
    it.each([
      { _status: 404 },
      { status: 404 },
      { response: { status: 404 } },
    ])('recognizes supported 404 error shapes', (error) => {
      expect(isNotFoundError(error)).toBe(true);
    });

    it('does not treat other errors as not found', () => {
      expect(isNotFoundError({ status: 403 })).toBe(false);
    });
  });
});
