import jsyaml from 'js-yaml';

/**
 * Return the individual resources contained in one or more YAML documents.
 * Kubernetes List documents are flattened so each item can be checked.
 */
export function resourcesFromYaml(yaml) {
  const documents = jsyaml.loadAll(yaml).filter((document) => !!document);

  return documents.flatMap((document) => {
    if (document.kind === 'List' && Array.isArray(document.items)) {
      return document.items;
    }

    return document;
  }).filter((resource) => !!resource);
}

/**
 * Convert Kubernetes apiVersion/kind into the resource type used by Steve.
 */
export function resourceType(resource) {
  const kind = resource?.kind?.toLowerCase();

  if (!kind) {
    return null;
  }

  if (!resource.apiVersion || resource.apiVersion === 'v1') {
    return kind;
  }

  return `${ resource.apiVersion.split('/', 1)[0] }.${ kind }`;
}

export function resourceIdentity(resource, schema, defaultNamespace) {
  const name = resource?.metadata?.name;
  const type = resourceType(resource);

  if (!name || !type) {
    return null;
  }

  const isNamespaced = schema ? schema.attributes?.namespaced : !!resource.metadata?.namespace;
  const namespace = isNamespaced ? resource.metadata?.namespace || defaultNamespace : undefined;

  return {
    id:   isNamespaced && namespace ? `${ namespace }/${ name }` : name,
    kind: resource.kind,
    name,
    namespace,
    type,
  };
}

export function isNotFoundError(error) {
  return error?._status === 404 || error?.status === 404 || error?.response?.status === 404;
}
