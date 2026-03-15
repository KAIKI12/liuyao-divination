const MT_SIZE = 312;
const MT_MIDDLE = 156;
const MATRIX_A = 0xB5026F5AA96619E9n;
const UPPER_MASK = 0xFFFFFFFF80000000n;
const LOWER_MASK = 0x7FFFFFFFn;
const UINT64_MASK = 0xFFFFFFFFFFFFFFFFn;
const TEMPER_B = 0x71D67FFFEDA60000n;
const TEMPER_C = 0xFFF7EEE000000000n;
const TEMPER_D = 0x5555555555555555n;
const INITIAL_MULTIPLIER = 6364136223846793005n;
const REAL_DIVISOR = 9007199254740992;
const REAL_SHIFT = 11n;
const COIN_THRESHOLD = 0.5;
const MAX_STATA_SEED = 2147483647n;
const MAX_FALLBACK_SUM = 100000000000000n;
const SPECIAL_QIAN = "111111";
const SPECIAL_KUN = "000000";
const utf8Encoder = new TextEncoder();

export class Mt64 {
  constructor(seed) {
    this.state = new Array(MT_SIZE).fill(0n);
    this.index = MT_SIZE + 1;
    this.seed(seed);
  }

  seed(seed) {
    this.state[0] = BigInt(seed) & UINT64_MASK;
    for (let i = 1; i < MT_SIZE; i += 1) {
      const prev = this.state[i - 1];
      this.state[i] =
        (INITIAL_MULTIPLIER * (prev ^ (prev >> 62n)) + BigInt(i)) & UINT64_MASK;
    }
    this.index = MT_SIZE;
  }

  nextUInt64() {
    if (this.index >= MT_SIZE) {
      this.twist();
    }

    let value = this.state[this.index];
    this.index += 1;
    value ^= (value >> 29n) & TEMPER_D;
    value ^= (value << 17n) & TEMPER_B;
    value ^= (value << 37n) & TEMPER_C;
    value ^= value >> 43n;
    return value & UINT64_MASK;
  }

  nextUniform() {
    const shifted = this.nextUInt64() >> REAL_SHIFT;
    return Number(shifted) / REAL_DIVISOR;
  }

  twist() {
    const mag01 = [0n, MATRIX_A];

    for (let i = 0; i < MT_SIZE - MT_MIDDLE; i += 1) {
      const bits = this.mixBits(i, i + 1);
      this.state[i] =
        this.state[i + MT_MIDDLE] ^
        (bits >> 1n) ^
        mag01[Number(bits & 1n)];
    }

    for (let i = MT_SIZE - MT_MIDDLE; i < MT_SIZE - 1; i += 1) {
      const bits = this.mixBits(i, i + 1);
      this.state[i] =
        this.state[i + (MT_MIDDLE - MT_SIZE)] ^
        (bits >> 1n) ^
        mag01[Number(bits & 1n)];
    }

    const lastBits = this.mixBits(MT_SIZE - 1, 0);
    this.state[MT_SIZE - 1] =
      this.state[MT_MIDDLE - 1] ^
      (lastBits >> 1n) ^
      mag01[Number(lastBits & 1n)];
    this.index = 0;
  }

  mixBits(currentIndex, nextIndex) {
    return (
      (this.state[currentIndex] & UPPER_MASK) |
      (this.state[nextIndex] & LOWER_MASK)
    );
  }
}

export function createDataIndex(entries) {
  return new Map(entries.map((entry) => [entry.code, entry]));
}

export function deriveSeed(input) {
  const value = normalizeDivinationInput(input);

  if (isDirectSeedInput(value)) {
    return Number(BigInt(value));
  }

  return deriveFallbackSeed(value);
}

export function generateNumberDivination(input, dataIndex) {
  const seed = deriveSeed(input);
  const hexagram = buildHexagram(seed);
  const resultCodes = collectResultCodes(hexagram);

  return {
    input: String(input).trim(),
    seed,
    ...hexagram,
    baseSymbol: lookupValue(dataIndex, `sym${hexagram.baseBits}`, "words"),
    changedSymbol: lookupValue(dataIndex, `sym${hexagram.changedBits}`, "words"),
    resultCodes,
    resultTexts: resultCodes.map((code) => lookupValue(dataIndex, code, "words")),
    resultNames: resultCodes.map((code) => lookupValue(dataIndex, code, "name")),
  };
}

export function buildHexagram(seed) {
  const rng = new Mt64(seed);
  const lines = new Array(6);
  let changingCount = 0;

  for (let row = 6; row >= 1; row -= 1) {
    const line = drawLine(rng, row);
    lines[row - 1] = line;
    changingCount += line.base !== line.changed ? 1 : 0;
  }

  return {
    lines,
    changingCount,
    baseBits: buildBits(lines, "base"),
    changedBits: buildBits(lines, "changed"),
  };
}

function normalizeDivinationInput(input) {
  const value = String(input).trim();

  if (value === "") {
    throw new TypeError("请输入数字或类似 [46] 的命令式输入。");
  }

  return value;
}

function isDirectSeedInput(value) {
  if (!/^\d+$/.test(value)) {
    return false;
  }

  return BigInt(value) <= MAX_STATA_SEED;
}

function deriveFallbackSeed(text) {
  let total = 0n;

  for (const char of Array.from(text)) {
    total += BigInt(encodeByteDigits(char));
  }

  if (total > MAX_FALLBACK_SUM) {
    throw new RangeError("请您精简语言。");
  }

  return Number(total % MAX_STATA_SEED);
}

function encodeByteDigits(value) {
  const bytes = utf8Encoder.encode(value);
  let escaped = "";

  for (const byte of bytes) {
    escaped += `\\d${String(byte).padStart(3, "0")}`;
  }

  return escaped.replace(/\D/g, "");
}

function drawLine(rng, row) {
  const coinSum = drawCoin(rng) + drawCoin(rng) + drawCoin(rng);

  if (coinSum === 3) {
    return { row, base: 1, changed: 0 };
  }

  if (coinSum === 2) {
    return { row, base: 0, changed: 0 };
  }

  if (coinSum === 1) {
    return { row, base: 1, changed: 1 };
  }

  return { row, base: 0, changed: 1 };
}

function drawCoin(rng) {
  return Math.floor(rng.nextUniform() + COIN_THRESHOLD);
}

function buildBits(lines, key) {
  return lines.map((line) => String(line[key])).join("");
}

function collectResultCodes({ baseBits, changedBits, changingCount, lines }) {
  if (changingCount === 0) {
    return [`div${baseBits}_0`];
  }

  if (changingCount === 1) {
    return [findChangedRows(lines)[0].baseCode(baseBits)];
  }

  if (changingCount === 2) {
    return buildAscendingChangedCodes(baseBits, lines);
  }

  if (changingCount === 3) {
    return buildThreeChangeCodes(baseBits, changedBits, lines);
  }

  if (changingCount === 4) {
    return buildDescendingStableCodes(changedBits, lines);
  }

  if (changingCount === 5) {
    return [findStableRows(lines)[0].changedCode(changedBits)];
  }

  return [buildAllChangingCode(baseBits, changedBits)];
}

function findChangedRows(lines) {
  return lines
    .filter((line) => line.base !== line.changed)
    .map(enrichRowAccessors);
}

function findStableRows(lines) {
  return lines
    .filter((line) => line.base === line.changed)
    .map(enrichRowAccessors);
}

function enrichRowAccessors(line) {
  return {
    ...line,
    baseCode(baseBits) {
      return `div${baseBits}_${line.row}`;
    },
    changedCode(changedBits) {
      return `div${changedBits}_${line.row}`;
    },
  };
}

function buildAscendingChangedCodes(baseBits, lines) {
  const result = [];

  for (let row = 6; row >= 1; row -= 1) {
    const line = lines[row - 1];
    if (line.base !== line.changed) {
      result.unshift(`div${baseBits}_${row}`);
    }
  }

  return result;
}

function buildThreeChangeCodes(baseBits, changedBits, lines) {
  const bottomLine = lines[5];

  if (bottomLine.base === bottomLine.changed) {
    return [`div${baseBits}_0`, `div${changedBits}_0`];
  }

  return [`div${changedBits}_0`, `div${baseBits}_0`];
}

function buildDescendingStableCodes(changedBits, lines) {
  const result = [];

  for (let row = 1; row <= 6; row += 1) {
    const line = lines[row - 1];
    if (line.base === line.changed) {
      result.unshift(`div${changedBits}_${row}`);
    }
  }

  return result;
}

function buildAllChangingCode(baseBits, changedBits) {
  if (baseBits === SPECIAL_QIAN) {
    return "div111111_7";
  }

  if (baseBits === SPECIAL_KUN) {
    return "div000000_7";
  }

  return `div${changedBits}_0`;
}

function lookupValue(dataIndex, code, field) {
  const entry = dataIndex.get(code);

  if (!entry) {
    throw new Error(`Missing I Ching data for code: ${code}`);
  }

  return entry[field];
}
