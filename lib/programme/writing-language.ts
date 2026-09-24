export type WritingLanguageCode = "en" | "nl"
export type WritingLanguageName = "English" | "Dutch"

export function writingLanguageCode(value: string | null | undefined): WritingLanguageCode {
  return value === "nl" ? "nl" : "en"
}

export function writingLanguageName(value: string | null | undefined): WritingLanguageName {
  return writingLanguageCode(value) === "nl" ? "Dutch" : "English"
}
