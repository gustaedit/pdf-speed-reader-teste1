"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"

// Componentes da UI (shadcn/ui e lucide-react)
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Progress } from "@/components/ui/progress"
import { Upload, Play, Pause, RotateCcw, FileText, Settings, Maximize, X, Moon, Sun, SkipBack, Info, ShieldCheck, Zap, Type } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"


// Tipos podem ser importados com segurança
import type { PDFDocumentProxy } from "pdfjs-dist"

// Interfaces e Tipos
interface PdfStats {
  pages: number
  words: number
  characters: number
}

type PdfjsLib = {
  getDocument: (args: any) => { promise: Promise<PDFDocumentProxy> };
  GlobalWorkerOptions: { workerSrc: string };
};

declare global {
  interface Window {
    pdfjsLib: PdfjsLib;
  }
}

export default function PDFSpeedReader() {
  // Estados principais da aplicação
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [extractedText, setExtractedText] = useState<string>("")
  const [textBlocks, setTextBlocks] = useState<string[]>([])
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [customText, setCustomText] = useState<string>("") // Estado para o texto digitado
  
  // Estados de configuração
  const [blocksPerSecond, setBlocksPerSecond] = useState(3)
  const [wordsPerBlock, setWordsPerBlock] = useState(3)
  
  // Estados da UI
  const [isLoading, setIsLoading] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [pdfStats, setPdfStats] = useState<PdfStats | null>(null)
  const [userMessage, setUserMessage] = useState<{ type: "success" | "error" | "warning"; text: string } | null>(null)
  const [pdfjs, setPdfjs] = useState<PdfjsLib | null>(null);
  const [showFullscreenSettings, setShowFullscreenSettings] = useState(false);

  // Refs
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const progressRef = useRef<HTMLDivElement>(null);

  // Efeito para carregar a biblioteca pdf.js a partir de uma CDN
  useEffect(() => {
    const scriptId = "pdfjs-script";
    if (document.getElementById(scriptId)) {
        if (window.pdfjsLib && !pdfjs) setPdfjs(window.pdfjsLib);
        return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.async = true;

    script.onload = () => {
      const pdfjsLib = window.pdfjsLib;
      if (pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        setPdfjs(pdfjsLib);
      } else {
        setUserMessage({ type: 'error', text: 'Não foi possível carregar o leitor de PDF.' });
      }
    };

    script.onerror = () => {
        setUserMessage({ type: 'error', text: 'Falha de rede ao carregar o leitor de PDF.' });
    };

    document.body.appendChild(script);

    return () => {
        const scriptElement = document.getElementById(scriptId);
        if (scriptElement) document.body.removeChild(scriptElement);
    };
  }, [pdfjs]);

  // Funções de processamento de texto
  const extractTextFromPDF = async (file: File): Promise<{ text: string; stats: PdfStats }> => {
    if (!pdfjs) throw new Error("Biblioteca PDF.js ainda não foi carregada.");
    const arrayBuffer = await file.arrayBuffer()
    const pdf: PDFDocumentProxy = await pdfjs.getDocument({ data: arrayBuffer }).promise
    let fullText = ""
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()
      fullText += textContent.items.map((item: any) => item.str || "").join(" ") + " ";
    }
    const cleanText = fullText.replace(/\s+/g, " ").trim()
    if (!cleanText) throw new Error("PDF não contém texto extraível.");
    const words = cleanText.split(/\s+/).filter(Boolean).length
    return { text: cleanText, stats: { pages: pdf.numPages, words, characters: cleanText.length } }
  }

  const segmentText = (text: string, currentWordsPerBlock: number): string[] => {
    const words = text.split(/\s+/).filter(Boolean)
    const blocks: string[] = []
    for (let i = 0; i < words.length; i += currentWordsPerBlock) {
      blocks.push(words.slice(i, i + currentWordsPerBlock).join(" "))
    }
    return blocks
  }
  
  const processAndStartText = (text: string, isFromPdf: boolean, pageCount: number = 0) => {
    const cleanText = text.replace(/\s+/g, " ").trim();
    const words = cleanText.split(/\s+/).filter(Boolean).length;

    if (words === 0) {
        setUserMessage({type: 'warning', text: 'Nenhum texto para ler.'});
        return;
    }

    setExtractedText(cleanText);
    const newBlocks = segmentText(cleanText, wordsPerBlock);
    setTextBlocks(newBlocks);
    setPdfStats({ pages: pageCount, words: words, characters: cleanText.length });
    setCurrentBlockIndex(0);
    setIsPlaying(false);
    setUserMessage({ type: "success", text: `Texto carregado com ${words} palavras.` });
  }

  // Manipuladores de eventos
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || file.type !== "application/pdf") {
      setUserMessage({ type: "error", text: "Por favor, selecione um ficheiro PDF válido." });
      return;
    }
    setIsLoading(true);
    setPdfFile(file);
    setUserMessage(null);
    try {
      const { text, stats } = await extractTextFromPDF(file);
      processAndStartText(text, true, stats.pages);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido.";
      setUserMessage({ type: "error", text: `Falha na extração: ${errorMessage}` });
      setPdfFile(null);
    } finally {
      setIsLoading(false);
    }
  }

  const handleCustomTextSubmit = () => {
    setPdfFile(null); // Garante que não há PDF associado
    processAndStartText(customText, false);
  }

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const pdfFile = Array.from(e.dataTransfer.files).find(f => f.type === "application/pdf");
    if (pdfFile) {
      const mockEvent = { target: { files: [pdfFile] } } as any;
      handleFileUpload(mockEvent);
    } else {
      setUserMessage({ type: "error", text: "Por favor, solte apenas ficheiros PDF." });
    }
  };
  
  const resetReader = () => {
    setPdfFile(null); 
    setPdfStats(null); 
    setTextBlocks([]); 
    setExtractedText("");
    setCustomText("");
    setCurrentBlockIndex(0);
    setIsPlaying(false);
    setUserMessage(null);
  }

  const handlePlayPause = () => textBlocks.length > 0 && setIsPlaying(!isPlaying);
  const handleReset = () => { setIsPlaying(false); setCurrentBlockIndex(0); };
  const handlePreviousBlock = () => setCurrentBlockIndex(p => Math.max(0, p - 1));
  const handleFullscreen = () => extractedText && setIsFullscreen(true);
  
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (progressRef.current && textBlocks.length > 0) {
      const rect = progressRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const newProgress = clickX / rect.width;
      const targetBlock = Math.floor(newProgress * textBlocks.length);
      setCurrentBlockIndex(Math.min(targetBlock, textBlocks.length - 1));
    }
  };

  // Efeitos secundários (Lifecycle)
  useEffect(() => {
    if (isPlaying && textBlocks.length > 0) {
      const interval = 1000 / blocksPerSecond;
      intervalRef.current = setInterval(() => {
        setCurrentBlockIndex(prev => {
          if (prev >= textBlocks.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, interval);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) };
  }, [isPlaying, blocksPerSecond, textBlocks.length]);

  useEffect(() => {
    if (extractedText) {
      const newBlocks = segmentText(extractedText, wordsPerBlock);
      setTextBlocks(newBlocks);
    }
  }, [wordsPerBlock, extractedText]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") { e.preventDefault(); handlePlayPause(); }
      if (e.code === "ArrowLeft") { e.preventDefault(); handlePreviousBlock(); }
      if (e.code === "Escape" && isFullscreen) setIsFullscreen(false);
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [isFullscreen, textBlocks, isPlaying]);

  useEffect(() => {
    if (isFullscreen) {
      const resetTimeout = () => {
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        setShowControls(true);
        controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
      };
      const handleInteraction = () => resetTimeout();
      resetTimeout();
      document.addEventListener("mousemove", handleInteraction);
      document.addEventListener("keydown", handleInteraction);
      return () => {
        document.removeEventListener("mousemove", handleInteraction);
        document.removeEventListener("keydown", handleInteraction);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      };
    }
  }, [isFullscreen]);

  const progress = textBlocks.length > 0 ? ((currentBlockIndex + 1) / textBlocks.length) * 100 : 0;

  const renderFocusedText = (text: string) => {
    if (!text) return <span>Pressione espaço para começar</span>;
    const words = text.split(' ');
    const middleIndex = Math.floor(words.length / 2);
    return words.map((word, index) => {
      if (index === middleIndex) {
        const pivot = Math.ceil(word.length / 2);
        
      }
      return <span key={index} className="inline-block mx-1">{word}</span>;
    });
  };

  if (isFullscreen) {
    return (
      <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-4 font-sans transition-colors duration-300 ${isDarkMode ? "bg-black text-gray-200" : "bg-white text-gray-800"}`}>
        <div className="flex-1 flex items-center justify-center w-full"><div className="text-4xl md:text-5xl lg:text-6xl font-semibold text-center leading-relaxed tracking-wide">{renderFocusedText(textBlocks[currentBlockIndex])}</div></div>
        <div className={`absolute bottom-0 left-0 right-0 p-4 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0"}`} onMouseEnter={() => setShowControls(true)}>
          <div className="max-w-3xl mx-auto p-3 rounded-xl shadow-2xl bg-black/20 dark:bg-gray-800/30 backdrop-blur-lg border border-white/10 dark:border-gray-700/50">
            <div ref={progressRef} onClick={handleProgressClick} className="w-full cursor-pointer py-2 group"><Progress value={progress} className="h-2 group-hover:h-3 transition-all duration-200" /></div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2"><Button onClick={handlePlayPause} size="icon" className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 text-white border-none">{isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current" />}</Button><Button onClick={handlePreviousBlock} variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/10" disabled={currentBlockIndex === 0}><SkipBack /></Button><Button onClick={handleReset} variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/10"><RotateCcw /></Button></div>
                <div className="text-xs font-mono text-white/80">{currentBlockIndex + 1} / {textBlocks.length}</div>
                <div className="flex items-center gap-2"><Button onClick={() => setShowFullscreenSettings(!showFullscreenSettings)} variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/10"><Settings /></Button><Button onClick={() => setIsFullscreen(false)} variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/10"><X /></Button></div>
              </div >
              {showFullscreenSettings && (<div className="grid grid-cols-2 gap-x-6 gap-y-4 mt-4 p-4 border-t border-white/10"><div className="space-y-2"><Label className="text-xs text-white/80">Velocidade (blocos/s)</Label><Slider value={[blocksPerSecond]} onValueChange={(v) => setBlocksPerSecond(v[0])} min={1} max={10} step={1} /></div><div className="space-y-2"><Label className="text-xs text-white/80">Tamanho (palavras/bloco)</Label><Slider value={[wordsPerBlock]} onValueChange={(v) => setWordsPerBlock(v[0])} min={1} max={10} step={1} /></div></div>)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 p-4 ${isDarkMode ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"}`}>
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex justify-between items-center"><div /><div className="text-center"><h1 className="text-4xl font-bold">PDF Speed Reader</h1><p className={isDarkMode ? "text-gray-400" : "text-gray-600"}>Otimize a sua leitura com velocidade configurável</p></div>
        <Button 
       // onClick={() => setIsDarkMode(!isDarkMode)} variant="ghost" size="icon"
        >
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button> 
          </header>
        {userMessage && (<Card className={`${userMessage.type === 'success' ? 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-800 dark:text-green-200' : userMessage.type === 'error' ? 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200' : 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200'}`}><CardContent className="pt-6 flex items-center gap-4"><Info className="w-5 h-5" /><p>{userMessage.text}</p><Button variant="ghost" size="icon" onClick={() => setUserMessage(null)} className="ml-auto h-8 w-8"><X className="w-4 h-4" /></Button></CardContent></Card>)}
        <Tabs defaultValue="reader" className="w-full">
            <TabsList className={`grid w-full grid-cols-2 ${isDarkMode ? "bg-gray-800 text-gray-300" : ""}`}><TabsTrigger value="reader"><FileText className="w-4 h-4 mr-2" />Leitor</TabsTrigger><TabsTrigger value="settings"><Settings className="w-4 h-4 mr-2" />Configurações</TabsTrigger></TabsList>
            <TabsContent value="reader" className="space-y-6">
                {!extractedText ? (
                    <Tabs defaultValue="upload" className="w-full">
                        <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="upload">Carregar PDF</TabsTrigger><TabsTrigger value="paste">Digitar Texto</TabsTrigger></TabsList>
                        <TabsContent value="upload">
                            <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}><CardHeader><CardTitle className="flex items-center gap-2"><Upload /> Upload do PDF</CardTitle></CardHeader><CardContent><div onDragOver={handleDragOver} onDrop={handleDrop} className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDarkMode ? "border-gray-600 hover:border-gray-500" : "border-gray-300 hover:border-gray-400"}`}><Upload className={`w-12 h-12 mx-auto mb-4 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`} /><p className="mb-2">Clique para selecionar ou arraste e solte o ficheiro aqui</p><Button onClick={() => fileInputRef.current?.click()} disabled={isLoading || !pdfjs}>{isLoading ? "A processar..." : !pdfjs ? "A carregar leitor..." : "Selecionar PDF"}</Button><input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />{isLoading && <Progress value={undefined} className="w-full mt-4" />}</div></CardContent></Card>
                        </TabsContent>
                        <TabsContent value="paste">
                            <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}><CardHeader><CardTitle className="flex items-center gap-2"><Type /> Inserir Texto Manualmente</CardTitle></CardHeader><CardContent className="space-y-4"><Textarea placeholder="Cole ou digite o seu texto aqui..." className={`h-40 ${isDarkMode ? 'bg-gray-900 text-white border-gray-700 placeholder:text-gray-500' : ''}`} value={customText} onChange={(e) => setCustomText(e.target.value)} /><Button onClick={handleCustomTextSubmit} disabled={!customText.trim()}>Iniciar Leitura</Button></CardContent></Card>
                        </TabsContent>
                    </Tabs>
                ) : (
                    <>
                        <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}><CardContent className="pt-6"><div className={`min-h-[200px] flex items-center justify-center p-4 rounded-lg border-2 ${isDarkMode ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"}`}><div className={`text-3xl md:text-4xl font-bold text-center leading-relaxed ${isDarkMode ? 'text-gray-200' : ''}`}>{renderFocusedText(textBlocks[currentBlockIndex] || "Pressione para começar")}</div></div></CardContent></Card>
                        <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}><CardContent className="pt-6 space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Button onClick={handlePlayPause} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold w-32"><div className="flex items-center">{isPlaying ? <><Pause className="mr-2 h-4 w-4" />Pausar</> : <><Play className="mr-2 h-4 w-4" />Reproduzir</>}</div></Button><Button onClick={handlePreviousBlock} variant="outline" disabled={currentBlockIndex === 0}>Voltar</Button><Button onClick={handleReset} variant="outline">Reiniciar</Button><Button onClick={handleFullscreen} variant="outline">Tela Cheia</Button></div><div className="text-sm text-gray-500 dark:text-gray-400 font-mono">{currentBlockIndex + 1} de {textBlocks.length} blocos</div></div><div ref={progressRef} onClick={handleProgressClick} className="w-full cursor-pointer py-1 group"><Progress value={progress} /></div></CardContent></Card>
                        <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}><CardContent className="pt-6 grid md:grid-cols-2 gap-6"><div className="space-y-2"><Label>Velocidade: {blocksPerSecond} palavras/segundo</Label><Slider value={[blocksPerSecond]} onValueChange={(v) => setBlocksPerSecond(v[0])} min={1} max={10} step={1} /></div><div className="space-y-2"><Label>Palavras por Bloco: {wordsPerBlock}</Label><Slider value={[wordsPerBlock]} onValueChange={(v) => setWordsPerBlock(v[0])} min={1} max={10} step={1} /></div></CardContent></Card>
                    </>
                )}
            </TabsContent>
            <TabsContent value="settings" className="space-y-6">
                <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}><CardHeader><CardTitle>Configurações Avançadas</CardTitle></CardHeader><CardContent className="space-y-6"><div className="flex items-center justify-between"><div className="space-y-0.5"><Label className={isDarkMode ? "text-white" : ""}>Modo Escuro</Label><p className="text-sm text-gray-500 dark:text-gray-400">Reduz o cansaço visual durante leituras prolongadas</p></div><Switch checked={isDarkMode} onCheckedChange={setIsDarkMode} /></div><div className="grid md:grid-cols-2 gap-4"><div className="space-y-2"><Label>Velocidade de Leitura</Label><Select value={String(blocksPerSecond)} onValueChange={(v) => setBlocksPerSecond(Number(v))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[...Array(10)].map((_, i) => <SelectItem key={i+1} value={String(i+1)}>{i+1} palavras/segundo</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Palavras por Bloco</Label><Select value={String(wordsPerBlock)} onValueChange={(v) => setWordsPerBlock(Number(v))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[...Array(10)].map((_, i) => <SelectItem key={i+1} value={String(i+1)}>{i+1} palavras</SelectItem>)}</SelectContent></Select></div></div></CardContent></Card>
                {pdfStats && (<Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}><CardHeader><CardTitle>Informações do Conteúdo</CardTitle></CardHeader><CardContent className="space-y-3"><p className="font-medium text-white">{pdfFile?.name || 'Texto Personalizado'}</p><p className="text-sm text-gray-400">{pdfStats.pages > 0 ? `${pdfStats.pages} páginas • ` : ''}{pdfStats.words} palavras • {pdfStats.characters} caracteres</p><p className="text-sm text-gray-400">{textBlocks.length} blocos de leitura</p><p className="text-sm text-gray-400">Tempo estimado: ~{Math.ceil(textBlocks.length / blocksPerSecond / 60)} min
                  </p><Button variant="outline" size="sm" onClick={resetReader}>Carregar Novo Conteúdo</Button>
                  </CardContent></Card>)}
                <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}><CardHeader><CardTitle className="flex items-center gap-2"><Info className="w-5 h-5" />Como funciona</CardTitle></CardHeader><CardContent className="text-sm text-gray-400 space-y-2"><p>• O aplicativo extrai texto de ficheiros PDF para uma leitura focada e sequencial.</p><p>• Funciona melhor com PDFs que contêm texto selecionável (não imagens).</p><p>• Utilize os atalhos de teclado para uma experiência de utilização mais rápida.</p></CardContent></Card>
                <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" />Status do Sistema</CardTitle></CardHeader><CardContent className="text-sm text-gray-400 space-y-2"><p>✅ Worker configurado via CDN</p><p>✅ Tratamento de erros com fallback</p><p>✅ Processamento seguro no navegador</p></CardContent></Card>
                <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}><CardHeader><CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5" />Atalhos do Teclado</CardTitle></CardHeader><CardContent className="text-sm text-gray-400 space-y-2"><p><kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500">Espaço</kbd> - Iniciar / Pausar a leitura</p><p><kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500">←</kbd> - Retroceder um bloco</p><p><kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500">Esc</kbd> - Sair da tela cheia</p></CardContent></Card>
            </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

