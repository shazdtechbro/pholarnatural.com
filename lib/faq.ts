/**
 * FAQ content (doc §1.11).
 *
 * The doc says the developer drafts the initial copy and the client refines it, so this is a
 * first pass written to be accurate against everything else in the build — prices, the 10%
 * deposit, the CAD $50 free-shipping threshold and the cancellation rules that are settled.
 *
 * The cancellation "middle window" is deliberately not answered with a number: it is still TBD
 * (doc §8.6). Do not invent one here.
 */

export type FaqCategory =
  | 'Products'
  | 'Services & Booking'
  | 'Shipping'
  | 'Payments'
  | 'Returns'

export interface FaqEntry {
  id: string
  category: FaqCategory
  question: string
  answer: string
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  'Products',
  'Services & Booking',
  'Shipping',
  'Payments',
  'Returns',
]

export const FAQS: FaqEntry[] = [
  {
    id: 'faq-hair-types',
    category: 'Products',
    question: 'Are your products suitable for all hair types?',
    answer:
      'Yes. While our roots are in African haircare tradition, the botanical blends are formulated to nourish every texture, from fine straight hair through to tight coils. The Restorative Hair Oil is lightweight enough for looser textures and rich enough for 4C hair.',
  },
  {
    id: 'faq-preservatives',
    category: 'Products',
    question: 'Do you use any preservatives?',
    answer:
      'We use natural, plant-derived preservation systems such as Radish Root Ferment and Vitamin E. They keep the products safe for their shelf life without parabens or formaldehyde-releasing agents.',
  },
  {
    id: 'faq-sulfates',
    category: 'Products',
    question: 'Is the shampoo sulfate-free?',
    answer:
      'Yes. The Botanical Cleanse Shampoo is sulfate-free and safe on colour-treated and chemically relaxed hair. It produces less foam than a sulfate shampoo — that is expected and not a sign it is not working.',
  },
  {
    id: 'faq-sizes',
    category: 'Products',
    question: 'What sizes do you sell?',
    answer:
      'The Restorative Hair Oil comes in 30ml, 100ml and 250ml. The Botanical Cleanse Shampoo comes in 100ml, 250ml and 500ml. Larger sizes carry a lower price per millilitre.',
  },
  {
    id: 'faq-booking-hours',
    category: 'Services & Booking',
    question: 'When are you open for appointments?',
    answer:
      'Monday through Saturday, 10:00 AM to 5:00 PM. We are closed on Sundays. Appointments start on the hour, and the booking calendar will only offer you a start time that leaves enough room for the service you picked.',
  },
  {
    id: 'faq-deposit',
    category: 'Services & Booking',
    question: 'Why do I need to pay a deposit?',
    answer:
      'A 10% deposit holds your slot. It comes off the final price, so you pay the remainder in the studio. Deposits keep the calendar honest for everyone waiting on a slot.',
  },
  {
    id: 'faq-consultation',
    category: 'Services & Booking',
    question: 'What happens during a Hair Treatment appointment?',
    answer:
      'We start with a strand test to work out the protein-to-moisture balance your hair needs, then clarify, run the protein phase under gentle heat, and finish with hydration. You leave with a written four-week aftercare plan.',
  },
  {
    id: 'faq-late',
    category: 'Services & Booking',
    question: 'What if I am running late?',
    answer:
      'Call us as soon as you can. We hold your chair for 15 minutes; past that we may need to shorten the service so the next client is not pushed back, and for longer services we may have to rebook.',
  },
  {
    id: 'faq-shipping-time',
    category: 'Shipping',
    question: 'How long does shipping take?',
    answer:
      'Orders are processed within 1–2 business days. Canadian orders then typically arrive in 3–7 business days. International orders take 7–14 business days depending on destination and customs.',
  },
  {
    id: 'faq-shipping-rates',
    category: 'Shipping',
    question: 'How much does shipping cost?',
    answer:
      'Shipping rates are based on your destination country and are always shown at checkout before you pay. We ship to Canada, the United States, the United Kingdom, and internationally.',
  },
  {
    id: 'faq-international',
    category: 'Shipping',
    question: 'Do you ship outside Canada?',
    answer:
      'Yes, we ship worldwide. Any customs duties or import taxes are set by the destination country and are the recipient’s responsibility. Final international rates are being confirmed and will be listed in full on our shipping policy page.',
  },
  {
    id: 'faq-currency',
    category: 'Payments',
    question: 'What currency are your prices in?',
    answer:
      'Every price on this site is in Canadian dollars (CAD). If you are paying with a card issued outside Canada, your bank sets the conversion rate.',
  },
  {
    id: 'faq-payment-methods',
    category: 'Payments',
    question: 'What payment methods do you accept?',
    answer:
      'Payments are processed by Stripe, which accepts all major credit and debit cards. We never see or store your card details.',
  },
  {
    id: 'faq-account',
    category: 'Payments',
    question: 'Do I need an account to order?',
    answer:
      'No. You can shop and check out as a guest, with your cart saved in the same browser. For a cart that follows you across devices, create an optional account with your email and password. Verify your email to see your bookings and orders, including past guest purchases made with that email.',
  },
  {
    id: 'faq-returns',
    category: 'Returns',
    question: 'Can I return an opened product?',
    answer:
      'Because these are personal care products, we can only accept returns on unopened items within 30 days of delivery. If something is not working for your hair, contact us — we would rather help you find the right routine than have you stuck with the wrong one.',
  },
  {
    id: 'faq-damaged',
    category: 'Returns',
    question: 'My order arrived damaged. What now?',
    answer:
      'Email us within 48 hours of delivery with a photo and your order number and we will replace it at no cost.',
  },
  {
    id: 'faq-cancel-booking',
    category: 'Returns',
    question: 'Can I cancel or reschedule an appointment?',
    answer:
      'Cancel within 30 minutes of booking for a full refund of the deposit. The deposit is forfeited if you cancel within 24 hours of your appointment. For cancellations between those two points, contact us directly — we are finalising that policy and will always deal with you fairly in the meantime.',
  },
]
