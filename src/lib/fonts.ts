import { Hanken_Grotesk, Montserrat } from "next/font/google";

// Fonts matched against the original badge artwork.
export const nameFont = Hanken_Grotesk({
  weight: "800",
  style: "italic",
  subsets: ["latin", "latin-ext"],
  variable: "--font-badge-name",
});

export const classFont = Montserrat({
  weight: "400",
  style: "italic",
  subsets: ["latin", "latin-ext"],
  variable: "--font-badge-class",
});
