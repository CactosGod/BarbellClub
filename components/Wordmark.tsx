import Image from "next/image";

// Club logo + name lockup. `size` controls the gorilla mark height in px.
export default function Wordmark({
  size = 40,
  showText = true,
}: {
  size?: number;
  showText?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/logo.png"
        alt="Käpylä Maanantai Barbell Club"
        width={size}
        height={size}
        className="rounded-sm object-contain"
        priority
      />
      {showText && (
        <span className="heading text-lg leading-none">
          <span className="text-sunset">Barbell</span> Club
        </span>
      )}
    </div>
  );
}
