// Author-time formatting only. The resulting string contains real line breaks;
// no JSON UI property, automatic engine wrapping, or runtime binding is assumed.
export function presentText(text, policy = { mode: "identity" }) {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  if (policy?.mode === "identity") return text;
  if (policy?.mode !== "break-long-tokens" || !Number.isInteger(policy.maxTokenCodePoints) || policy.maxTokenCodePoints < 1) {
    throw new Error("unsupported text presentation policy");
  }
  const limit = policy.maxTokenCodePoints;
  return text.replace(/\S+/gu, (token) => {
    const characters = Array.from(token), lines = [];
    for (let start = 0; start < characters.length; start += limit) lines.push(characters.slice(start, start + limit).join(""));
    return lines.join("\n");
  });
}
