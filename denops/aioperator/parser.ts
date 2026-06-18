/**
 * Streaming tag extractor (pure, dependency-free).
 *
 * Consumes an async stream of text deltas and yields only the content found
 * between `openTag` and `closeTag`, flushing as soon as enough text is
 * available to be sure it is not the start of `closeTag`.
 *
 * A model wrapping its answer in `<tag>…</tag>` almost always places the
 * payload on the line *after* the opening tag. That line break is a
 * formatting artefact, not part of the answer, so a single leading line
 * terminator (plus any spaces/tabs sitting on the tag's own line) is stripped
 * so the result does not start with a spurious empty line. The strip happens
 * lazily because the line break may arrive in a later delta than the tag.
 */
export async function* extractBetweenTags(
  deltas: AsyncIterable<string>,
  openTag: string,
  closeTag: string,
): AsyncGenerator<string> {
  let parseBuffer = "";
  let seenOpenTag = false;
  let seenCloseTag = false;
  let stripLeadingNewline = false;
  const openTailKeep = openTag.length - 1;
  const closeTailKeep = closeTag.length - 1;

  for await (const delta of deltas) {
    if (seenCloseTag) {
      break;
    }
    parseBuffer += delta;

    if (!seenOpenTag) {
      const openIdx = parseBuffer.indexOf(openTag);
      if (openIdx === -1) {
        // Keep just enough of the tail that a tag straddling two deltas
        // can still be matched.
        if (parseBuffer.length > openTailKeep) {
          parseBuffer = parseBuffer.slice(-openTailKeep);
        }
        continue;
      }
      seenOpenTag = true;
      parseBuffer = parseBuffer.slice(openIdx + openTag.length);
      // The payload almost always starts on the next line. Strip exactly one
      // leading line terminator (and spaces/tabs on the tag's line) so the
      // output does not begin with an empty line.
      stripLeadingNewline = true;
    }

    if (stripLeadingNewline) {
      const leading = parseBuffer.match(/^[ \t]*\r?\n/);
      if (leading) {
        parseBuffer = parseBuffer.slice(leading[0].length);
        stripLeadingNewline = false;
      } else if (parseBuffer.length > 0 && !/^[ \t]*$/.test(parseBuffer)) {
        // Payload already starts with real content; nothing to strip.
        stripLeadingNewline = false;
      } else {
        // Only whitespace so far: keep buffering until we can tell whether a
        // line break is coming, and skip flushing so we never emit
        // indeterminate whitespace.
        continue;
      }
    }

    const closeIdx = parseBuffer.indexOf(closeTag);
    if (closeIdx !== -1) {
      const out = parseBuffer.slice(0, closeIdx);
      parseBuffer = "";
      seenCloseTag = true;
      if (out.length > 0) {
        yield out;
      }
      break;
    }

    if (parseBuffer.length > closeTailKeep) {
      const flushLen = parseBuffer.length - closeTailKeep;
      yield parseBuffer.slice(0, flushLen);
      parseBuffer = parseBuffer.slice(flushLen);
    }
  }

  if (!seenCloseTag) {
    throw new Error("Failed to extract transformed text from model output");
  }
}
