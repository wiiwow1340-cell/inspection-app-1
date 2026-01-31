export const NA_SENTINEL = "__NA__";

export type ImageValue = string[] | string;

export const isNAValue = (value?: ImageValue) => value === NA_SENTINEL;

export const normalizeImageValue = (value?: ImageValue): string[] => {
  if (!value || value === NA_SENTINEL) return [];
  return Array.isArray(value) ? value : [value];
};

export const normalizeImagesMap = (images?: Record<string, ImageValue>) => {
  const next: Record<string, ImageValue> = {};
  Object.entries(images || {}).forEach(([key, value]) => {
    if (value === NA_SENTINEL) {
      next[key] = value;
      return;
    }
    const list = normalizeImageValue(value);
    if (list.length > 0) next[key] = list;
  });
  return next;
};
