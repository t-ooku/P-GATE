// Only same-origin known shop routes; never trust an arbitrary server-provided href.
export function sellerShopLink(shop={}) {
  const pilot=String(shop.url||'');
  if(/^\/seller-pilot\/shops\/SPL_[a-zA-Z0-9-]+$/u.test(pilot))return pilot;
  return `/shop/${encodeURIComponent(String(shop.slug||''))}`;
}
