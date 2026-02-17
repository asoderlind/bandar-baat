import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getGenderClass(
  partOfSpeech?: string,
  gender?: string | null,
): string {
  if (partOfSpeech === "NOUN" && gender === "MASCULINE")
    return "gender-masculine";
  if (partOfSpeech === "NOUN" && gender === "FEMININE") return "gender-feminine";
  return "";
}
