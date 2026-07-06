/** Initiales d'un nom (mêmes règles que la pastille avatar à l'écran). */
export function nameInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
