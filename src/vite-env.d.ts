/// <reference types="vite/client" />

interface Window {
  html2canvas: (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
}
