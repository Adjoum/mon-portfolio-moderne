// src/types/latexjs.d.ts
declare module 'https://cdn.jsdelivr.net/npm/latex.js/dist/latex.mjs' {
  export class HtmlGenerator {
    constructor(options?: {
      hyphenate?: boolean;
      documentClass?: string;
      styles?: string[];
    });
    reset(): void;
    htmlDocument(baseURL?: string): Document;
    stylesAndScripts(baseURL?: string): DocumentFragment;
    domFragment(): DocumentFragment;
    documentTitle(): string;
  }
  
  export function parse(
    latex: string, 
    options: { generator: HtmlGenerator }
  ): HtmlGenerator;
  
  export class LaTeXJSComponent extends HTMLElement {}
}