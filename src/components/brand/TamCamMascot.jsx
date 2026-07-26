const sizes = {
  nav: "h-12 w-12",
  card: "h-16 w-16",
  feature: "h-20 w-20",
};

function TamCamMascot({ size = "card", className = "", alt = "" }) {
  const sizeClass = sizes[size] || sizes.card;

  return (
    <img
      src="/tamcam-logo.png"
      alt={alt}
      className={`${sizeClass} object-contain shrink-0 ${className}`.trim()}
    />
  );
}

export default TamCamMascot;
