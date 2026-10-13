import { Link } from 'react-router-dom';
import { BadgeCheck, Leaf, MapPin } from 'lucide-react';
import type { Category } from '@rythubazaar/shared';
import { useI18n } from '../context/I18nContext';
import { formatDate } from '../lib/format';
import type { PublicListing } from '../lib/types';
import { Money, Pill } from './ui';

export function ProduceImage({
  listing,
  className = 'aspect-[4/3]',
}: {
  listing: Pick<PublicListing, 'photos' | 'category' | 'cropName'>;
  className?: string;
}) {
  const photo = listing.photos[0];
  if (photo) {
    return (
      <img
        src={photo}
        alt={listing.cropName}
        loading="lazy"
        className={`${className} w-full rounded-xl object-cover`}
      />
    );
  }
  // No farmer photo: show a generic illustration, clearly labelled so buyers never mistake it
  // for a photo of this farmer's actual produce.
  return <IllustrationImage src={stockImageFor(listing.cropName, listing.category)} className={className} />;
}

function IllustrationImage({ src, className }: { src: string; className: string }) {
  const { t } = useI18n();
  return (
    <div className={`${className} relative w-full overflow-hidden rounded-xl`}>
      <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      <span className="absolute bottom-1.5 right-1.5 rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
        {t('listing.illustration')}
      </span>
    </div>
  );
}

/** Crop-name keywords (English + the six launch languages) → illustration. */
const STOCK_IMAGES: { keys: string[]; file: string }[] = [
  { file: 'tomato', keys: ['tomato', 'టమాటా', 'టమోటా', 'தக்காளி', 'ಟೊಮ್ಯಾಟೊ', 'ಟೊಮೆಟೊ', 'തക്കാളി', 'टमाटर'] },
  { file: 'onion', keys: ['onion', 'ఉల్లి', 'வெங்காய', 'ಈರುಳ್ಳಿ', 'ഉള്ളി', 'प्याज'] },
  {
    file: 'brinjal',
    keys: ['brinjal', 'eggplant', 'aubergine', 'వంకాయ', 'கத்தரி', 'ಬದನೆ', 'വഴുതന', 'बैंगन'],
  },
  { file: 'okra', keys: ['okra', 'lady', 'bhindi', 'బెండ', 'வெண்டை', 'ಬೆಂಡೆ', 'വെണ്ട', 'भिंडी'] },
  {
    file: 'chilli',
    keys: ['chilli', 'chili', 'mirchi', 'మిర్చి', 'మిరప', 'மிளகாய்', 'ಮೆಣಸ', 'മുളക്', 'मिर्च'],
  },
  { file: 'banana', keys: ['banana', 'అరటి', 'வாழை', 'ಬಾಳೆ', 'വാഴ', 'केला'] },
  { file: 'mango', keys: ['mango', 'మామిడి', 'மாம்பழ', 'ಮಾವ', 'മാമ്പഴ', 'आम'] },
  {
    file: 'spinach',
    keys: ['spinach', 'palak', 'greens', 'పాలకూర', 'కూర', 'கீரை', 'ಸೊಪ್ಪು', 'ചീര', 'पालक', 'साग'],
  },
  { file: 'coconut', keys: ['coconut', 'కొబ్బరి', 'தேங்காய்', 'ತೆಂಗಿನ', 'ತೆಂಗು', 'തേങ്ങ', 'नारियल'] },
  {
    file: 'dal',
    keys: ['dal', 'dhal', 'lentil', 'pulse', 'gram', 'పప్పు', 'பருப்பு', 'ಬೇಳೆ', 'പരിപ്പ്', 'दाल'],
  },
];

const CATEGORY_IMAGE: Record<Category, string> = {
  VEGETABLES: 'vegetables',
  FRUITS: 'fruits',
  LEAFY_GREENS: 'spinach',
  GRAINS_PULSES: 'dal',
  SPICES: 'spices',
  OTHER: 'produce',
};

export function stockImageFor(cropName: string, category: Category): string {
  const name = cropName.toLocaleLowerCase();
  const match = STOCK_IMAGES.find((s) => s.keys.some((k) => name.includes(k.toLocaleLowerCase())));
  return `/produce/${match?.file ?? CATEGORY_IMAGE[category]}.svg`;
}

/** States exactly what an "organic" or "natural" claim is based on. */
export function ClaimBadge({
  listing,
  detailed,
}: {
  listing: Pick<PublicListing, 'growingPractice' | 'claim'>;
  detailed?: boolean;
}) {
  const { t, lang } = useI18n();
  const verified = listing.claim.basis === 'STAFF_VERIFIED_CERTIFICATE';
  if (!detailed) {
    if (verified) {
      return (
        <Pill tone="green">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
          {t('claim.verifiedBadge')}
        </Pill>
      );
    }
    if (listing.growingPractice === 'CONVENTIONAL') return null;
    return <Pill tone="earth">{t(`practice.${listing.growingPractice}`)}</Pill>;
  }
  const basis = verified
    ? t('claim.verified', {
        number: listing.claim.certificateNumber ?? '',
        body: listing.claim.body ?? '',
        date: formatDate(listing.claim.verifiedAt, lang),
      })
    : listing.claim.certificationStatus === 'PENDING_VERIFICATION'
      ? t('claim.pending')
      : listing.claim.certificationStatus === 'REJECTED'
        ? t('claim.rejected')
        : t('claim.farmerReported');
  return (
    <div className="rounded-xl border border-line bg-ivory-50 p-3.5">
      <p className="flex items-center gap-1.5 font-medium">
        {verified ? (
          <BadgeCheck className="h-4 w-4 text-forest-600" aria-hidden />
        ) : (
          <Leaf className="h-4 w-4 text-earth-500" aria-hidden />
        )}
        {t(`practice.${listing.growingPractice}`)}
      </p>
      <p className="mt-1 text-sm text-ink-muted">{basis}</p>
    </div>
  );
}

export function ListingCard({ listing }: { listing: PublicListing }) {
  const { t } = useI18n();
  return (
    <Link
      to={`/market/${listing.id}`}
      className="card group flex flex-col gap-3 p-3 transition-shadow hover:shadow-card"
    >
      <ProduceImage listing={listing} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-1 pb-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate font-semibold group-hover:text-forest-800">{listing.cropName}</h3>
          <ClaimBadge listing={listing} />
        </div>
        <p className="flex items-center gap-1 text-sm text-ink-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {listing.location.village}, {listing.location.district}
          </span>
        </p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <p>
            <Money paise={listing.pricePerUnitPaise} className="text-lg font-semibold text-forest-900" />{' '}
            <span className="text-sm text-ink-muted">
              {t('market.perUnit', { unit: t(`unit.${listing.unit}`) })}
            </span>
          </p>
          <span className="text-xs text-ink-muted">
            {listing.purchasable
              ? t('market.available', { qty: listing.quantityAvailable, unit: t(`unit.${listing.unit}`) })
              : t('market.outOfStock')}
          </span>
        </div>
      </div>
    </Link>
  );
}
