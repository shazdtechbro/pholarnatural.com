import Image from 'next/image'
import Link from 'next/link'
import { Leaf, Rabbit, Recycle, ArrowRight } from 'lucide-react'
import RevealOnScroll from '@/components/animations/RevealOnScroll'
import ParallaxSection from '@/components/animations/ParallaxSection'
import { getPublicSettings } from '@/lib/api/settings'

export const VALUES = [
  {
    icon: Leaf,
    title: '100% Natural',
    description:
      'Cold-pressed botanicals and nothing synthetic. Every ingredient is one you can pronounce.',
  },
  {
    icon: Rabbit,
    title: 'Cruelty Free',
    description: 'Never tested on animals, at any stage, by us or by anyone in our supply chain.',
  },
  {
    icon: Recycle,
    title: 'Sustainable',
    description: 'Amber glass, recyclable packaging, and botanicals bought directly from growers.',
  },
] as const

/** Homepage about section (doc §1.2.4). */
export default async function About() {
  const settings = await getPublicSettings()
  return (
    <section id="about" className="scroll-mt-24 bg-surface-container py-16">
      <div className="mx-auto max-w-7xl px-5 md:px-16">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <ParallaxSection offset={20}>
            <div className="grid grid-cols-2 gap-4">
              <div className="relative mt-6 aspect-[3/4] overflow-hidden rounded-3xl shadow-lg">
                <Image
                  src={settings.featured_image_url || '/images/about/raw-ingredients.webp'}
                  alt="Raw botanical ingredients including shea butter and dried hibiscus"
                  fill
                  sizes="(max-width: 1024px) 50vw, 25vw"
                  className="object-cover"
                />
              </div>
              <div className="relative mb-6 aspect-[3/4] overflow-hidden rounded-3xl shadow-lg">
                <Image
                  src="/images/about/mortar-pestle.webp"
                  alt="A traditional wooden mortar and pestle being used to grind botanicals"
                  fill
                  sizes="(max-width: 1024px) 50vw, 25vw"
                  className="object-cover"
                />
              </div>
            </div>
          </ParallaxSection>

          <div>
            <RevealOnScroll direction="right">
              <p className="font-label-sm text-label-sm uppercase tracking-widest text-secondary">
                Our Story
              </p>
              <h2 className="mb-6 mt-2 font-headline-lg text-headline-lg-mobile text-primary md:text-headline-lg">
                Haircare rooted in nature and tradition
              </h2>
              <p className="mb-4 font-body-lg text-body-lg text-on-surface-variant">
                Born from a desire to reclaim traditional African beauty rituals, Pholar Natural
                combines hand-harvested botanicals with modern science. We believe that what goes on
                your crown should be as pure as the nature it comes from.
              </p>
              <p className="mb-8 font-body-lg text-body-lg text-on-surface-variant">
                Every formulation begins with growers we buy from directly, and is blended in small
                batches so nothing sits long enough to need a preservative it does not deserve. The
                same products we sell are the ones used in our studio — if it is not good enough for
                our chair, it does not reach the shelf.
              </p>
            </RevealOnScroll>

            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {VALUES.map(({ icon: Icon, title, description }, i) => (
                <RevealOnScroll as="li" key={title} index={i}>
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h3 className="mb-1 font-label-sm text-label-sm font-bold uppercase text-on-surface">
                    {title}
                  </h3>
                  <p className="font-body-md text-[13px] text-on-surface-variant">{description}</p>
                </RevealOnScroll>
              ))}
            </ul>

            <RevealOnScroll>
              <Link
                href="/about"
                className="group mt-8 inline-flex items-center gap-2 font-label-sm text-label-sm text-primary"
              >
                Learn More About Us
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </Link>
            </RevealOnScroll>
          </div>
        </div>
      </div>
    </section>
  )
}
