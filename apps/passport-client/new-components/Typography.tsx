import { Property } from "csstype";
import React from "react";
import styled from "styled-components";

export type FontWeight = 400 | 500 | 600 | 700 | 800 | 900;
export type FontSize = 14 | 16 | 18;

const LINE_HEIGHT: Record<FontSize, number> = {
  "14": 18.9,
  "16": 21.6,
  "18": 24.3
};

const TypographyText = styled.span<{
  $fontSize: FontSize;
  $fontWeight: FontWeight;
  $color: Property.Color;
  $opacity?: number;
  $underline?: boolean;
}>`
  font-family: "Barlow", sans-serif;
  font-size: ${({ $fontSize }): string => `${$fontSize}px`};
  font-weight: ${({ $fontWeight }): number => $fontWeight};
  line-height: ${({ $fontSize }): string =>
    `${LINE_HEIGHT[$fontSize ?? 16]}px`};
  color: ${({ $color }): Property.Color => $color};
  opacity: ${({ $opacity }): number => $opacity ?? 1};
  text-decoration: ${({ $underline }): string =>
    $underline ? "underline" : "none"};
`;

interface TypographyProps {
  fontSize?: FontSize;
  fontWeight?: FontWeight;
  color?: Property.Color;
  children?: React.ReactNode;
  opacity?: number;
  underline?: boolean;
  style?: React.CSSProperties;
}
export const Typography: React.FC<TypographyProps> = ({
  children,
  fontSize = 14,
  fontWeight = 400,
  color = "black",
  opacity,
  underline,
  style
}): JSX.Element => {
  return (
    <TypographyText
      $fontSize={fontSize}
      $fontWeight={fontWeight}
      $color={color}
      $opacity={opacity}
      $underline={underline}
      style={style}
    >
      {children}
    </TypographyText>
  );
};
