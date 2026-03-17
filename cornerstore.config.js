// Corner Store configuration
// Edit the values below to customize your store

export default {
  // Your store name — appears in the header and browser tab
  name: 'Corner Store',

  // Which page renders at /
  home: 'home',

  // Main navigation — appears in the header
  nav: [
    { label: 'Shop', page: 'home' },
    { label: 'About', page: 'about' },
  ],

  // Footer navigation — appears at the bottom of every page
  footerNav: [
    { label: 'Shipping Policy', page: 'shipping-policy' },
    { label: 'Returns Policy', page: 'returns-policy' },
    { label: 'FAQ', page: 'faq' },
  ],
}
