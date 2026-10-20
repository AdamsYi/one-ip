// Localization keys belong to the browser catalog; every backend field must match.
export function workerCatalog(services) {
  return services.map((service) => {
    const entry = { ...service };
    delete entry.nameKey;
    delete entry.noteKey;
    return entry;
  });
}
