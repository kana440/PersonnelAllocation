// Shared types for all CSV import definitions
export type FieldDef = {
  key: string      // JS property name used for object access (= schema field name)
  header?: string  // SF CSV row-1 header — omit when identical to key
  en: string       // CSV row 2 (English)
  ja: string       // CSV row 3 (Japanese)
}
