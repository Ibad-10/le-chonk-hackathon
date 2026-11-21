import { Star } from "lucide-react";

/** 0-3 stars, filled amber for earned, outline for the rest; `pop` lands them one by one. */
export default function Stars({ count, size = 28, pop = false }: { count: number; size?: number; pop?: boolean }) {
  return (
    <span className="inline-flex gap-1" role="img" aria-label={`${count} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <Star
          key={i}
          size={i === 1 && pop ? size * 1.25 : size}
          aria-hidden="true"
          className={`${i < count ? "fill-room-red text-room-red" : "text-room-line"} ${pop ? "star-pop" : ""}`}
          style={pop ? { animationDelay: `${150 + i * 220}ms` } : undefined}
        />
      ))}
    </span>
  );
}
