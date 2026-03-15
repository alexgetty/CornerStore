# Make currency formatting locale configurable

## Current state

`formatPrice` and `getCurrencyDecimalPlaces` hardcode `'en-US'` as the locale. This makes output deterministic regardless of build machine — a French machine building a USD store still produces `$19.99`.

This is correct for V1 but not configurable. A non-US seller formatting EUR prices would see `€19.99` (US format) instead of `19,99 €` (EU format).

## Future: configurable locale

When site-wide config lands, add `locale` as a supported property:

```typescript
new Intl.NumberFormat(config.locale ?? 'en-US', {
  style: 'currency',
  currency: currency.toUpperCase(),
})
```

## Dependency

Blocked on site-wide config file existing. The setup-experience plan notes "Store-wide options belong in a local config file." This is one of those options.
