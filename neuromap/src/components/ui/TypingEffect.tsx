import React, { useState, useEffect } from 'react';

interface TypingEffectProps {
  text: string | JSX.Element;
  speed: number;
}

export const TypingEffect: React.FC<TypingEffectProps> = ({ text, speed }) => {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    if (typeof text !== 'string') return;

    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayedText((prev) => prev + text.charAt(i));
        i++;
      } else {
        clearInterval(timer);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed]);

  return (
    <span dangerouslySetInnerHTML={{ __html: displayedText.replace('Spoony', '<span class="text-blue-600 font-semibold">Spoony</span>') }} />
  );
};