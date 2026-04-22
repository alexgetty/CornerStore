export default {
  name: "Despair Factory",
  home: 'home',
  nav: [
    {
        "label": "Shop",
        "page": "home"
    },
    {
        "label": "About",
        "page": "about"
    }
],
  footerNav: [
    {
        "label": "Shipping Policy",
        "page": "shipping-policy"
    },
    {
        "label": "Returns Policy",
        "page": "returns-policy"
    },
    {
        "label": "FAQ",
        "page": "faq"
    },
    {
        "label": "Privacy Policy",
        "page": "privacy-policy"
    },
    {
        "label": "Terms of Service",
        "page": "terms-of-service"
    }
],
  contact: "support@despairfactory.com",
  listings: { views: ['card', 'table'] },
  minCartSize: 50,
}
