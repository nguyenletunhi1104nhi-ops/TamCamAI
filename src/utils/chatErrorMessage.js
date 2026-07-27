export function getApiErrorKind(error) {
  const rawText = [
    error?.message,
    error?.errorKind,
    error?.status,
    error?.details,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    rawText.includes("403") ||
    rawText.includes("permission-denied") ||
    rawText.includes("permission denied") ||
    rawText.includes("denied access")
  ) {
    return "permission-denied";
  }

  if (
    rawText.includes("429") ||
    rawText.includes("quota") ||
    rawText.includes("rate limit") ||
    rawText.includes("rate-limit")
  ) {
    return "quota-or-rate-limit";
  }

  if (
    rawText.includes("failed to fetch") ||
    rawText.includes("fetch failed") ||
    rawText.includes("econnrefused") ||
    rawText.includes("networkerror")
  ) {
    return "network";
  }

  return "unknown";
}

export function createFriendlyChatErrorMessage(error) {
  const errorKind = getApiErrorKind(error);

  if (errorKind === "permission-denied") {
    return [
      "TamCam chua dung duoc AI cloud vi provider dang tu choi quyen truy cap.",
      "Ban kiem tra lai API key/project tren server roi thu lai sau nhe.",
    ].join("\n");
  }

  if (errorKind === "quota-or-rate-limit") {
    return [
      "AI cloud dang het quota hoac bi gioi han toc do.",
      "Toi co the ho tro co ban bang du lieu local, nhung phan tich sau co the bi han che.",
    ].join("\n");
  }

  if (errorKind === "network") {
    return [
      "TamCam chua ket noi duoc voi dich vu AI.",
      "Ban thu lai sau it phut hoac kiem tra server Node/FastAPI dang chay chua.",
    ].join("\n");
  }

  return "TamCam dang gap su co khi xu ly cau hoi nay. Ban thu lai sau it phut nhe.";
}
