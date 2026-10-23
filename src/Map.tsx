import {
  destinations,
  raceRoute,
  type Destination,
  type Telemetry,
} from "./types";
export default function Map({
  telemetry,
  large = false,
  onTravel,
}: {
  telemetry: Telemetry;
  large?: boolean;
  onTravel: (d: Destination) => void;
}) {
  const sx = (x: number) => 150 + x * 0.96,
    sy = (z: number) => 180 + z * 0.96;
  return (
    <svg
      viewBox="0 0 300 330"
      role="img"
      aria-label="Map of Palm Avenue. Choose a destination to fast travel."
      className={large ? "city-map large" : "city-map"}
    >
      <defs>
        <pattern
          id={large ? "blocks-l" : "blocks-s"}
          width="35"
          height="44"
          patternUnits="userSpaceOnUse"
        >
          <rect x="5" y="5" width="25" height="33" rx="2" fill="#39483e" />
        </pattern>
      </defs>
      <rect width="300" height="330" fill="#263628" />
      <path d="M0 0H300V330H0Z" fill="#222d26" />
      <path
        d="M251 0Q246 130 256 200T250 330"
        fill="none"
        stroke="#7e9b88"
        strokeWidth="1"
      />
      <rect
        x="7"
        y="8"
        width="226"
        height="312"
        fill={`url(#${large ? "blocks-l" : "blocks-s"})`}
      />
      {[83, 150, 217].map((x) => (
        <path
          key={x}
          d={`M${x} 0V330`}
          stroke="#667466"
          strokeWidth={x === 150 ? 12 : 7}
        />
      ))}
      {[-112, -65, -20, 28, 110].map((z) => (
        <path key={z} d={`M0 ${sy(z)}H242`} stroke="#667466" strokeWidth="8" />
      ))}
      <path
        d="M150 0V330"
        stroke="#a1ab7a"
        strokeWidth="1"
        strokeDasharray="3 5"
      />
      <text
        x="270"
        y="170"
        fill="#7fa49e"
        fontSize="9"
        letterSpacing="3"
        transform="rotate(90 270 170)"
      >
        GREEN BELT
      </text>
      {destinations.map((d) => (
        <g
          key={d.id}
          role="button"
          tabIndex={0}
          aria-label={`Fast travel to ${d.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onTravel(d.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onTravel(d.id);
            }
          }}
          className="map-pin"
        >
          <circle
            cx={sx(d.x)}
            cy={sy(d.z)}
            r={large ? 12 : 10}
            fill={d.color}
          />
          <text
            x={sx(d.x)}
            y={sy(d.z) + 3.5}
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            fill="#18231c"
          >
            {d.symbol}
          </text>
          {large && (
            <text
              x={sx(d.x) + (d.x < 0 ? -18 : 18)}
              y={sy(d.z) + 4}
              textAnchor={d.x < 0 ? "end" : "start"}
              fill="#eff2e7"
              fontSize="8"
            >
              {d.place.replace("The ", "")}
            </text>
          )}
        </g>
      ))}
      {telemetry.route && telemetry.route.length > 1 && (
        <polyline
          points={telemetry.route.map(([x, z]) => `${sx(x)},${sy(z)}`).join(" ")}
          fill="none"
          stroke="#b892ff"
          strokeWidth={large ? 4 : 3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {(telemetry.race === "running" || telemetry.race === "countdown") && (
        <>
          <polyline
            points={raceRoute
              .slice(telemetry.checkpoint)
              .map(([x, z]) => `${sx(x)},${sy(z)}`)
              .join(" ")}
            fill="none"
            stroke="#dcf3a2"
            strokeWidth="2"
            strokeDasharray="4 4"
          />
          <circle
            cx={sx(raceRoute[telemetry.checkpoint][0])}
            cy={sy(raceRoute[telemetry.checkpoint][1])}
            r="7"
            fill="#edffa9"
            stroke="#fff"
            strokeWidth="2"
          />
        </>
      )}
      <g
        transform={`translate(${sx(telemetry.x)} ${sy(telemetry.z)}) rotate(${(-telemetry.heading * 180) / Math.PI})`}
      >
        <circle r="11" fill="#fff" opacity=".12" />
        <path
          d="M0-7L5 5 0 3-5 5Z"
          fill="white"
          stroke="#1b2a22"
          strokeWidth="1"
        />
      </g>
      <g transform="translate(18 24)">
        <text fill="#e6ecdc" fontSize="10">
          N
        </text>
        <path d="M3 7v14m-4-10 4-4 4 4" fill="none" stroke="#e6ecdc" />
      </g>
    </svg>
  );
}
