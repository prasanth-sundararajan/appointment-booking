"""Deposit math (Business Rule 1). Money is always integer minor units."""

from decimal import ROUND_HALF_UP, Decimal

# ISO 4217 currencies whose minor unit is not 2 decimal places.
_ZERO_DECIMAL = {
    "BIF",
    "CLP",
    "DJF",
    "GNF",
    "ISK",
    "JPY",
    "KMF",
    "KRW",
    "PYG",
    "RWF",
    "UGX",
    "VND",
    "VUV",
    "XAF",
    "XOF",
    "XPF",
}
_THREE_DECIMAL = {"BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"}


def calc_deposit(price_minor: int, percent: int) -> int:
    """Return `price_minor * percent / 100` rounded half-up to the minor unit.

    The minor unit is already the smallest unit of the business currency, so the
    same formula is correct for every currency (JPY, USD, KWD, ...).
    """
    if price_minor < 0:
        raise ValueError("price_minor must be >= 0")
    if not 0 <= percent <= 100:
        raise ValueError("percent must be between 0 and 100")
    amount = Decimal(price_minor) * Decimal(percent) / Decimal(100)
    return int(amount.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def currency_exponent(currency: str) -> int:
    """Number of decimal places of the currency's minor unit."""
    code = currency.upper()
    if code in _ZERO_DECIMAL:
        return 0
    if code in _THREE_DECIMAL:
        return 3
    return 2


def format_money(amount_minor: int, currency: str) -> str:
    """Human readable amount, e.g. `12.50 USD` (used in emails)."""
    exp = currency_exponent(currency)
    if exp == 0:
        return f"{amount_minor} {currency.upper()}"
    value = Decimal(amount_minor) / (Decimal(10) ** exp)
    return f"{value:.{exp}f} {currency.upper()}"
