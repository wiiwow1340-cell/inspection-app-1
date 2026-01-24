export type Process = {
  name: string;
  code: string;
  model: string;
  items: string[];
};

export type Report = {
  id: string;
  serial: string;
  model: string;
  process: string;
  images: Record<string, string>;
  expected_items: string[];
};
