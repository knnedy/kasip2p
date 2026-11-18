// A name people recognise until they choose their own; never "Linux x86_64".
export function defaultDeviceName(ua: string): string {
  const android = /Android [\d.]+; ([^;)]+)\)/.exec(ua);
  if (android) {
    const model = android[1]!.replace(/ Build\/.*/, "").trim();
    // reduced user agents report the model as "K"
    if (model.length > 1 && model !== "K") return model.slice(0, 64);
    return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  }
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Ubuntu/.test(ua)) return "Ubuntu computer";
  if (/Linux|X11/.test(ua)) return "Linux computer";
  return "This device";
}
