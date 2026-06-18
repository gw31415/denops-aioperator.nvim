import { extractBetweenTags } from "./parser.ts";

// --- Tiny dependency-free test helpers (keeps this test hermetic/offline) ---

let failed = 0;
let passed = 0;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    failed++;
    throw new Error(`Assertion failed: ${msg}`);
  }
  passed++;
}

function assertEquals<T>(actual: T, expected: T, msg = ""): void {
  assert(
    actual === expected,
    `expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}${
      msg ? " — " + msg : ""
    }`,
  );
}

async function assertRejects(
  fn: () => Promise<unknown>,
  msg: string,
): Promise<void> {
  try {
    await fn();
  } catch {
    passed++;
    return;
  }
  failed++;
  throw new Error(`Expected rejection but resolved: ${msg}`);
}

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let out = "";
  for await (const piece of gen) out += piece;
  return out;
}

const OPEN = "<aiop_sabcdef>";
const CLOSE = "</aiop_sabcdef>";

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.log(`  FAIL ${name}`);
    console.log(`       ${(e as Error).message}`);
    throw e;
  }
}

// --- The actual regression tests ---

await test(
  "strips the single leading newline right after the opening tag",
  async () => {
    const g = async function* () {
      yield `${OPEN}\nHello\n${CLOSE}`;
    };
    const result = await collect(extractBetweenTags(g(), OPEN, CLOSE));
    assertEquals(result, "Hello\n", "leading newline stripped, trailing kept");
  },
);

await test(
  "strips leading newline even when it arrives in a later delta",
  async () => {
    const g = async function* () {
      yield OPEN;
      yield "\n";
      yield "Hello";
      yield "\n";
      yield CLOSE;
    };
    const result = await collect(extractBetweenTags(g(), OPEN, CLOSE));
    assertEquals(result, "Hello\n");
  },
);

await test(
  "does not add a leading empty line when delivered byte by byte",
  async () => {
    const full = `${OPEN}\nHello world\nsecond line\n${CLOSE}`;
    const g = async function* () {
      for (const ch of full) yield ch;
    };
    const result = await collect(extractBetweenTags(g(), OPEN, CLOSE));
    assertEquals(result, "Hello world\nsecond line\n");
    assert(!result.startsWith("\n"), "result must not start with newline");
  },
);

await test("strips a CRLF leading terminator", async () => {
  const g = async function* () {
    yield `${OPEN}\r\nHi${CLOSE}`;
  };
  const result = await collect(extractBetweenTags(g(), OPEN, CLOSE));
  assertEquals(result, "Hi");
});

await test(
  "strips spaces sitting on the tag's line before the leading newline",
  async () => {
    const g = async function* () {
      yield `${OPEN}  \nindented content${CLOSE}`;
    };
    const result = await collect(extractBetweenTags(g(), OPEN, CLOSE));
    assertEquals(result, "indented content");
  },
);

await test(
  "preserves intentional indentation on the payload's first line",
  async () => {
    const g = async function* () {
      yield `${OPEN}\n    code line\n${CLOSE}`;
    };
    const result = await collect(extractBetweenTags(g(), OPEN, CLOSE));
    assertEquals(result, "    code line\n");
  },
);

await test("keeps content when there is no leading newline", async () => {
  const g = async function* () {
    yield `${OPEN}flat content${CLOSE}`;
  };
  const result = await collect(extractBetweenTags(g(), OPEN, CLOSE));
  assertEquals(result, "flat content");
});

await test(
  "keeps a deliberate blank line after the first content line",
  async () => {
    // First newline (tag separator) is stripped; the second blank line is
    // payload content and must be preserved.
    const g = async function* () {
      yield `${OPEN}\n\nblank above me\n${CLOSE}`;
    };
    const result = await collect(extractBetweenTags(g(), OPEN, CLOSE));
    assertEquals(result, "\nblank above me\n");
  },
);

await test(
  "buffers leading whitespace across deltas until the newline arrives",
  async () => {
    const g = async function* () {
      yield OPEN;
      yield "   "; // spaces on the tag line, newline not here yet
      yield "\n";
      yield "after spaces";
      yield CLOSE;
    };
    const result = await collect(extractBetweenTags(g(), OPEN, CLOSE));
    assertEquals(result, "after spaces");
  },
);

await test("flushes long payloads incrementally (streaming)", async () => {
  // Payload longer than the close-tag tail buffer forces an intermediate flush.
  const body = "A".repeat(CLOSE.length + 10);
  const g = async function* () {
    yield OPEN;
    yield "\n";
    yield body;
    yield CLOSE;
  };
  const result = await collect(extractBetweenTags(g(), OPEN, CLOSE));
  assertEquals(result, body);
});

await test("throws when the close tag never arrives", async () => {
  const g = async function* () {
    yield `${OPEN}\nno close tag here`;
  };
  await assertRejects(
    () => collect(extractBetweenTags(g(), OPEN, CLOSE)),
    "missing close tag",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) Deno.exit(1);
