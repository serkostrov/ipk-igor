export const PRECISE_DECIMAL_SCALE = 18;

const SCALE_FACTOR = 10n ** BigInt(PRECISE_DECIMAL_SCALE);

function powerOfTen(exponent: number): bigint {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 200) {
    throw new Error("Decimal scale is out of range");
  }
  return 10n ** BigInt(exponent);
}

function roundQuotient(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error("Cannot divide by zero");
  const negative = numerator < 0n !== denominator < 0n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  const quotient = absoluteNumerator / absoluteDenominator;
  const remainder = absoluteNumerator % absoluteDenominator;
  const rounded = quotient + (remainder * 2n >= absoluteDenominator ? 1n : 0n);
  return negative ? -rounded : rounded;
}

function parseUnits(value: number | string): bigint {
  const source = typeof value === "number" ? value.toString() : value.trim();
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Decimal value must be finite");
  }
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(source);
  if (!match) throw new Error("Decimal value is invalid");

  const sign = match[1] === "-" ? -1n : 1n;
  const whole = match[2];
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 200) {
    throw new Error("Decimal exponent is out of range");
  }

  const digits = BigInt(`${whole}${fraction}`);
  const targetExponent = exponent - fraction.length + PRECISE_DECIMAL_SCALE;
  const units =
    targetExponent >= 0
      ? digits * powerOfTen(targetExponent)
      : roundQuotient(digits, powerOfTen(-targetExponent));
  return sign * units;
}

export class PreciseDecimal {
  readonly #units: bigint;

  private constructor(units: bigint) {
    this.#units = units;
  }

  static from(value: number | string): PreciseDecimal {
    return new PreciseDecimal(parseUnits(value));
  }

  static zero(): PreciseDecimal {
    return new PreciseDecimal(0n);
  }

  add(other: PreciseDecimal): PreciseDecimal {
    return new PreciseDecimal(this.#units + other.#units);
  }

  subtract(other: PreciseDecimal): PreciseDecimal {
    return new PreciseDecimal(this.#units - other.#units);
  }

  multiply(other: PreciseDecimal): PreciseDecimal {
    return new PreciseDecimal(
      roundQuotient(this.#units * other.#units, SCALE_FACTOR),
    );
  }

  divide(other: PreciseDecimal): PreciseDecimal {
    return new PreciseDecimal(
      roundQuotient(this.#units * SCALE_FACTOR, other.#units),
    );
  }

  compare(other: PreciseDecimal): number {
    return this.#units < other.#units ? -1 : this.#units > other.#units ? 1 : 0;
  }

  isPositive(): boolean {
    return this.#units > 0n;
  }

  isNegative(): boolean {
    return this.#units < 0n;
  }

  toRoundedNumber(scale: number): number {
    if (
      !Number.isInteger(scale) ||
      scale < 0 ||
      scale > PRECISE_DECIMAL_SCALE
    ) {
      throw new Error("Rounded decimal scale is out of range");
    }
    const roundedUnits = roundQuotient(
      this.#units,
      powerOfTen(PRECISE_DECIMAL_SCALE - scale),
    );
    const numericUnits = Number(roundedUnits);
    if (!Number.isSafeInteger(numericUnits)) {
      throw new Error("Rounded decimal is outside the supported range");
    }
    return numericUnits / 10 ** scale;
  }

  toNumber(): number {
    const value = Number(this.toString());
    if (!Number.isFinite(value))
      throw new Error("Decimal is outside the supported range");
    return value;
  }

  toString(): string {
    const negative = this.#units < 0n;
    const absolute = negative ? -this.#units : this.#units;
    const digits = absolute.toString().padStart(PRECISE_DECIMAL_SCALE + 1, "0");
    const whole = digits.slice(0, -PRECISE_DECIMAL_SCALE);
    const fraction = digits.slice(-PRECISE_DECIMAL_SCALE).replace(/0+$/, "");
    const body = fraction ? `${whole}.${fraction}` : whole;
    return negative && absolute !== 0n ? `-${body}` : body;
  }
}

export function sumPreciseDecimals(values: PreciseDecimal[]): PreciseDecimal {
  return values.reduce((sum, value) => sum.add(value), PreciseDecimal.zero());
}
