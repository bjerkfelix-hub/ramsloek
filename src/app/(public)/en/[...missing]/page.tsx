import { notFound } from 'next/navigation'

// Unknown /en/... paths get the English 404 inside the English layout (others use global-not-found).
export default function MissingEnglishPage() {
  notFound()
}
