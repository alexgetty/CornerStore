# Add locale config for currency formatting

## Problem

`formatPrice` uses `new Intl.NumberFormat(undefined, ...)` which inherits the build machine's locale. A French machine building a USD store produces `19,99 $US` instead of `$19.99`. Formatting should be explicit, not environment-dependent.

## Immediate fix (V1)

Add a `locale` property to site-wide config (when config exists). Default to `en-US`.

```typescript
new Intl.NumberFormat(config.locale ?? 'en-US', {
  style: 'currency',
  currency: currency.toUpperCase(),
})
```

This makes output deterministic regardless of build machine. USD sellers get `$19.99` everywhere.

## Dependency

Blocked on site-wide config file existing. The setup-experience plan notes "Store-wide options belong in a local config file." This is one of those options.

If config lands before this is addressed, add `locale` as a supported property. If this needs to ship before config, hardcode `'en-US'` as the default with a TODO.
