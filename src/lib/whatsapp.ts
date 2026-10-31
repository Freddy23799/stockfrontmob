/** Lien WhatsApp pret a envoyer : `phone` au format international (les chiffres sont gardes). Null si pas de numero utilisable. */
export function waLink(phone: string | null | undefined, text: string): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length < 8 ? null : `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
