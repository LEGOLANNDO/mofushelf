import React from 'react';

interface ConfettiEffectProps {
  triggerKey: number;
}

const PIECES = [
  { left: '12%', delay: '0ms', color: '#FF8FA3', shape: '●' },
  { left: '22%', delay: '60ms', color: '#7AD9C5', shape: '★' },
  { left: '34%', delay: '20ms', color: '#FFE082', shape: '◆' },
  { left: '46%', delay: '90ms', color: '#FF8FA3', shape: '♥' },
  { left: '56%', delay: '40ms', color: '#7AD9C5', shape: '●' },
  { left: '68%', delay: '70ms', color: '#A68CF2', shape: '★' },
  { left: '78%', delay: '10ms', color: '#FFE082', shape: '●' },
  { left: '88%', delay: '80ms', color: '#FF8FA3', shape: '♥' },
];

export const ConfettiEffect: React.FC<ConfettiEffectProps> = ({ triggerKey }) => {
  if (triggerKey === 0) return null;

  return (
    <div
      key={triggerKey}
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-14 z-50 mx-auto max-w-md overflow-hidden h-44"
    >
      {PIECES.map((piece, idx) => (
        <span
          key={`${triggerKey}-${idx}`}
          className="confetti-piece absolute top-0 text-base font-bold drop-shadow-sm"
          style={{
            left: piece.left,
            color: piece.color,
            animationDelay: piece.delay,
          }}
        >
          {piece.shape}
        </span>
      ))}
    </div>
  );
};
