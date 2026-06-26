export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
}

export interface BrandFonts {
  heading: string;
  body: string;
}

export interface CustomFont {
  name: string;
  path: string;
}

export interface BrandSocials {
  instagram?: string;   // e.g. "@nohemipirela"
  website?: string;     // e.g. "nohemipirela.com"
  tiktok?: string;
  youtube?: string;
}

export interface BrandConfig {
  name: string;
  colors: BrandColors;
  fonts: BrandFonts;
  customFonts: CustomFont[];
  logoPath: string | null;
  styleKeywords: string[];
  socials?: BrandSocials;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_BRAND: BrandConfig = {
  name: "",
  colors: {
    primary: "#1a1a2e",
    secondary: "#16213e",
    accent: "#e94560",
    background: "#ffffff",
    surface: "#f5f5f5",
  },
  fonts: {
    heading: "Inter",
    body: "Inter",
  },
  customFonts: [],
  logoPath: null,
  styleKeywords: [],
  socials: {},
  createdAt: "",
  updatedAt: "",
};
