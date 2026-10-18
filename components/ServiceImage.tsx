import Image from 'next/image'

interface ServiceImageProps {
  slug: string
  src: string
  alt: string
  variant: 'card' | 'tall'
  sizes: string
  className?: string
  priority?: boolean
}

/** Service imagery is managed by the service record, never overridden by a mock gallery. */
export default function ServiceImage({
  src,
  alt,
  sizes,
  className = '',
  priority = false,
}: ServiceImageProps) {
  return (
    <Image
      src={src || '/images/hero/woman-braids.webp'}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={className}
    />
  )
}
