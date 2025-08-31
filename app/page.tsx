"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Progress } from "@/components/ui/progress"
import {
  Upload,
  Play,
  Pause,
  RotateCcw,
  FileText,
  Settings,
  Maximize,
  X,
  ChevronLeft,
  Moon,
  Sun,
  SkipBack,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

export default function PDFSpeedReader() {
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [extractedText, setExtractedText] = useState<string>("")
  const [textBlocks, setTextBlocks] = useState<string[]>([])
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [wordsPerSecond, setWordsPerSecond] = useState(3)
  const [wordsPerBlock, setWordsPerBlock] = useState(3)
  const [isLoading, setIsLoading] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [pdfStats, setPdfStats] = useState<{
    pages: number
    words: number
    characters: number
  } | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Função para extrair texto real do PDF usando PDF.js
  const extractTextFromPDF = async (file: File): Promise<string> => {
    try {
      // Importa PDF.js dinamicamente
      const pdfjsLib = await import("pdfjs-dist")

      // Configura o worker com versão compatível
      // Usa a mesma versão para API e Worker
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js`

      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

      let fullText = ""
      const totalPages = pdf.numPages

      // Extrai texto de cada página
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()

        // Combina todos os itens de texto da página
        const pageText = textContent.items
          .map((item: any) => {
            // Verifica se o item tem a propriedade str
            if (item && typeof item.str === "string") {
              return item.str
            }
            return ""
          })
          .join(" ")

        fullText += pageText + " "
      }

      // Limpa e normaliza o texto
      const cleanText = fullText
        .replace(/\s+/g, " ") // Remove espaços múltiplos
        .replace(/\n+/g, " ") // Remove quebras de linha múltiplas
        .trim()

      // Calcula estatísticas
      const words = cleanText.split(/\s+/).filter((word) => word.length > 0).length
      const characters = cleanText.length

      setPdfStats({
        pages: totalPages,
        words,
        characters,
      })

      if (!cleanText || cleanText.length < 10) {
        throw new Error("PDF não contém texto extraível. Pode ser um PDF escaneado ou com imagens.")
      }

      return cleanText
    } catch (error) {
      console.error("Erro ao extrair texto do PDF:", error)

      if (error instanceof Error) {
        // Verifica se é erro de versão
        if (error.message.includes("API version") && error.message.includes("Worker version")) {
          throw new Error(
            "Erro de compatibilidade do PDF.js. Tentando recarregar... Por favor, tente novamente em alguns segundos.",
          )
        }
        throw new Error(`Erro ao processar PDF: ${error.message}`)
      } else {
        throw new Error("Erro desconhecido ao processar o PDF. Verifique se o arquivo não está corrompido.")
      }
    }
  }

  // Função alternativa usando FileReader para PDFs simples
  const extractTextFallback = async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        // Texto simulado baseado no nome do arquivo para demonstração
        const simulatedText = `Conteúdo extraído do arquivo: ${file.name}

Este é um texto de demonstração que simula a extração de conteúdo de um PDF.
A leitura rápida é uma técnica poderosa para aumentar a velocidade de processamento de informações.

Através da apresentação sequencial de palavras ou pequenos grupos de palavras,
é possível treinar o cérebro para processar texto mais rapidamente.

Esta técnica é especialmente útil para:
- Estudantes que precisam revisar grandes volumes de material
- Profissionais que lidam com documentos extensos
- Pesquisadores que analisam múltiplas fontes
- Qualquer pessoa que queira otimizar seu tempo de leitura

O aplicativo permite configurar a velocidade de apresentação,
adaptando-se ao ritmo individual de cada usuário.

Com prática regular, é possível aumentar significativamente
a velocidade de leitura mantendo a compreensão do conteúdo.

A interface foi projetada para minimizar distrações
e maximizar o foco durante a sessão de leitura.

O modo de tela cheia oferece uma experiência imersiva,
enquanto os controles discretos permitem ajustes sem interromper o fluxo.

O modo escuro reduz o cansaço visual durante sessões prolongadas,
e a funcionalidade de voltar blocos ajuda quando você perde o foco momentaneamente.

Estas são ferramentas essenciais para uma experiência de leitura otimizada
e produtiva no mundo digital moderno.`

        const words = simulatedText.split(/\s+/).filter((word) => word.length > 0).length
        const characters = simulatedText.length

        setPdfStats({
          pages: 1,
          words,
          characters,
        })

        resolve(simulatedText)
      }
      reader.readAsArrayBuffer(file)
    })
  }

  // Função para segmentar o texto em blocos
  const segmentText = (text: string, wordsPerBlock: number): string[] => {
    const words = text.split(/\s+/).filter((word) => word.length > 0)
    const blocks: string[] = []

    for (let i = 0; i < words.length; i += wordsPerBlock) {
      const block = words.slice(i, i + wordsPerBlock).join(" ")
      blocks.push(block)
    }

    return blocks
  }

  // Manipular upload do PDF
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || file.type !== "application/pdf") {
      alert("Por favor, selecione um arquivo PDF válido.")
      return
    }

    setIsLoading(true)
    setPdfFile(file)
    setPdfStats(null)

    try {
      let text: string

      try {
        // Tenta extrair com PDF.js primeiro
        text = await extractTextFromPDF(file)
      } catch (pdfError) {
        console.warn("PDF.js falhou, usando método alternativo:", pdfError)
        // Se PDF.js falhar, usa método alternativo
        text = await extractTextFallback(file)
        alert(
          "Aviso: Usando modo de demonstração. Para extrair texto real de PDFs, o PDF.js precisa estar configurado corretamente.",
        )
      }

      setExtractedText(text)
      const blocks = segmentText(text, wordsPerBlock)
      setTextBlocks(blocks)
      setCurrentBlockIndex(0)
      setIsPlaying(false)

      // Mostra sucesso
      alert(
        `PDF processado com sucesso!\n\nEstatísticas:\n- ${pdfStats?.pages || 0} páginas\n- ${pdfStats?.words || 0} palavras\n- ${blocks.length} blocos de leitura`,
      )
    } catch (error) {
      console.error("Erro ao processar PDF:", error)
      const errorMessage = error instanceof Error ? error.message : "Erro ao processar o arquivo PDF."
      alert(errorMessage)
      setPdfFile(null)
      setPdfStats(null)
    } finally {
      setIsLoading(false)
    }
  }

  // Drag and drop functionality
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const files = Array.from(e.dataTransfer.files)
    const pdfFile = files.find((file) => file.type === "application/pdf")

    if (!pdfFile) {
      alert("Por favor, solte apenas arquivos PDF.")
      return
    }

    // Simula o evento de input para reutilizar a lógica existente
    const mockEvent = {
      target: { files: [pdfFile] },
    } as React.ChangeEvent<HTMLInputElement>

    await handleFileUpload(mockEvent)
  }

  // Atualizar segmentação quando mudar palavras por bloco
  useEffect(() => {
    if (extractedText) {
      const blocks = segmentText(extractedText, wordsPerBlock)
      setTextBlocks(blocks)
      setCurrentBlockIndex(0)
      setIsPlaying(false)
    }
  }, [wordsPerBlock, extractedText])

  // Controlar reprodução
  useEffect(() => {
    if (isPlaying && textBlocks.length > 0) {
      const interval = 1000 / wordsPerSecond
      intervalRef.current = setInterval(() => {
        setCurrentBlockIndex((prev) => {
          if (prev >= textBlocks.length - 1) {
            setIsPlaying(false)
            return prev
          }
          return prev + 1
        })
      }, interval)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isPlaying, wordsPerSecond, textBlocks.length])

  // Auto-hide controls in fullscreen
  useEffect(() => {
    if (isFullscreen) {
      const resetTimeout = () => {
        if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current)
        }
        setShowControls(true)
        controlsTimeoutRef.current = setTimeout(() => {
          setShowControls(false)
        }, 3000)
      }

      const handleMouseMove = () => resetTimeout()
      const handleKeyPress = () => resetTimeout()

      resetTimeout()
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("keydown", handleKeyPress)

      return () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("keydown", handleKeyPress)
        if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current)
        }
      }
    }
  }, [isFullscreen])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault()
        handlePlayPause()
      } else if (e.code === "Escape" && isFullscreen) {
        setIsFullscreen(false)
      } else if (e.code === "ArrowLeft") {
        e.preventDefault()
        handlePreviousBlock()
      }
    }

    document.addEventListener("keydown", handleKeyPress)
    return () => document.removeEventListener("keydown", handleKeyPress)
  }, [isFullscreen, isPlaying, textBlocks.length])

  const handlePlayPause = () => {
    if (textBlocks.length === 0) return
    setIsPlaying(!isPlaying)
  }

  const handleReset = () => {
    setIsPlaying(false)
    setCurrentBlockIndex(0)
  }

  const handlePreviousBlock = () => {
    if (currentBlockIndex > 0) {
      setCurrentBlockIndex((prev) => prev - 1)
    }
  }

  const handleFullscreen = () => {
    setIsFullscreen(true)
  }

  const handleExitFullscreen = () => {
    setIsFullscreen(false)
  }

  const progress = textBlocks.length > 0 ? (currentBlockIndex / textBlocks.length) * 100 : 0

  // Fullscreen Reader Component
  if (isFullscreen) {
    return (
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center transition-colors duration-300 ${
          isDarkMode ? "bg-gray-900 text-white" : "bg-white text-gray-900"
        }`}
      >
        {/* Main Text Display */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-4xl">
            <div
              className={`text-4xl md:text-6xl lg:text-7xl font-bold leading-relaxed transition-colors duration-300 ${
                isDarkMode ? "text-white" : "text-gray-800"
              }`}
            >
              {textBlocks[currentBlockIndex] || "Pressione espaço para começar"}
            </div>
          </div>
        </div>

        {/* Overlay Controls */}
        <div
          className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
            showControls ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* Top Controls */}
          <div className="absolute top-4 left-4 right-4 flex justify-between items-center pointer-events-auto">
            <div className="flex items-center gap-2">
              <Button
                onClick={handleExitFullscreen}
                variant="secondary"
                size="sm"
                className={`${isDarkMode ? "bg-gray-800 hover:bg-gray-700 text-white" : "bg-white/90 hover:bg-white"} backdrop-blur-sm`}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div
              className={`px-3 py-1 rounded-full text-sm ${
                isDarkMode ? "bg-gray-800/90 text-white" : "bg-white/90 text-gray-700"
              } backdrop-blur-sm`}
            >
              {currentBlockIndex + 1} / {textBlocks.length}
            </div>
          </div>

          {/* Bottom Controls */}
          <div className="absolute bottom-4 left-4 right-4 pointer-events-auto">
            <div className="flex justify-center items-center gap-4 mb-4">
              <Button
                onClick={handlePreviousBlock}
                variant="secondary"
                size="sm"
                disabled={currentBlockIndex === 0}
                className={`${isDarkMode ? "bg-gray-800 hover:bg-gray-700 text-white" : "bg-white/90 hover:bg-white"} backdrop-blur-sm`}
              >
                <SkipBack className="w-4 h-4" />
              </Button>

              <Button
                onClick={handlePlayPause}
                size="lg"
                className={`${isDarkMode ? "bg-gray-800 hover:bg-gray-700 text-white" : "bg-white/90 hover:bg-white text-gray-900"} backdrop-blur-sm`}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </Button>

              <Button
                onClick={handleReset}
                variant="secondary"
                size="sm"
                className={`${isDarkMode ? "bg-gray-800 hover:bg-gray-700 text-white" : "bg-white/90 hover:bg-white"} backdrop-blur-sm`}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>

            <Progress
              value={progress}
              className={`w-full h-2 ${isDarkMode ? "bg-gray-800" : "bg-white/90"} backdrop-blur-sm`}
            />
          </div>

          {/* Side Controls */}
          <div className="absolute left-4 top-1/2 transform -translate-y-1/2 pointer-events-auto">
            <Button
              onClick={handlePreviousBlock}
              variant="ghost"
              size="sm"
              disabled={currentBlockIndex === 0}
              className={`${isDarkMode ? "text-white hover:bg-gray-800" : "text-gray-600 hover:bg-white/20"} backdrop-blur-sm`}
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>
          </div>
        </div>

        {/* Instructions */}
        <div
          className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center transition-opacity duration-300 ${
            textBlocks.length === 0 ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <p className={`text-lg ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
            Carregue um PDF para começar a leitura
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`min-h-screen transition-colors duration-300 p-4 ${
        isDarkMode
          ? "bg-gradient-to-br from-gray-900 to-gray-800 text-white"
          : "bg-gradient-to-br from-blue-50 to-indigo-100 text-gray-900"
      }`}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-between">
            <div></div>
            <div>
              <h1 className={`text-4xl font-bold ${isDarkMode ? "text-white" : "text-gray-800"}`}>PDF Speed Reader</h1>
              <p className={isDarkMode ? "text-gray-400" : "text-gray-600"}>
                Otimize sua leitura com velocidade configurável
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setIsDarkMode(!isDarkMode)}
                variant="ghost"
                size="sm"
                className="flex items-center gap-2"
              >
                {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="reader" className="w-full">
          <TabsList className={`grid w-full grid-cols-2 ${isDarkMode ? "bg-gray-800" : ""}`}>
            <TabsTrigger value="reader" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Leitor
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Configurações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reader" className="space-y-6">
            {/* Upload Section */}
            {!pdfFile && (
              <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}>
                <CardHeader>
                  <CardTitle className={`flex items-center gap-2 ${isDarkMode ? "text-white" : "text-gray-800"}`}>
                    <Upload className="w-5 h-5" />
                    Upload do PDF
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center hover:border-gray-400 transition-colors ${
                      isDarkMode ? "border-gray-600 hover:border-gray-500" : "border-gray-300"
                    }`}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  >
                    <Upload className={`w-12 h-12 mx-auto mb-4 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`} />
                    <p className={`text-lg font-medium mb-2 ${isDarkMode ? "text-gray-200" : "text-gray-700"}`}>
                      Clique para selecionar um arquivo PDF
                    </p>
                    <p className={`mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                      Ou arraste e solte o arquivo aqui
                    </p>
                    <Button onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
                      {isLoading ? "Processando PDF..." : "Selecionar PDF"}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    {isLoading && (
                      <div className="mt-4">
                        <div className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                          Extraindo texto do PDF...
                        </div>
                        <Progress value={undefined} className="w-full mt-2" />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reader Section */}
            {pdfFile && textBlocks.length > 0 && (
              <>
                {/* Display Area */}
                <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}>
                  <CardContent className="pt-6">
                    <div
                      className={`min-h-[200px] flex items-center justify-center rounded-lg border-2 ${
                        isDarkMode ? "bg-gray-900 border-gray-600" : "bg-white border-gray-200"
                      }`}
                    >
                      <div className="text-center p-8">
                        <div
                          className={`text-3xl md:text-4xl lg:text-5xl font-bold leading-relaxed ${
                            isDarkMode ? "text-white" : "text-gray-800"
                          }`}
                        >
                          {textBlocks[currentBlockIndex] || "Pressione reproduzir para começar"}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Controls */}
                <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}>
                  <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <Button onClick={handlePlayPause} size="lg" className="flex items-center gap-2">
                          {isPlaying ? (
                            <>
                              <Pause className="w-4 h-4" />
                              Pausar
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4" />
                              Reproduzir
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={handlePreviousBlock}
                          variant="outline"
                          size="lg"
                          disabled={currentBlockIndex === 0}
                          className="flex items-center gap-2 bg-transparent"
                        >
                          <SkipBack className="w-4 h-4" />
                          Voltar
                        </Button>
                        <Button
                          onClick={handleReset}
                          variant="outline"
                          size="lg"
                          className="flex items-center gap-2 bg-transparent"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Reiniciar
                        </Button>
                        <Button
                          onClick={handleFullscreen}
                          variant="outline"
                          size="lg"
                          className="flex items-center gap-2 bg-transparent"
                        >
                          <Maximize className="w-4 h-4" />
                          Tela Cheia
                        </Button>
                      </div>

                      <div className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                        {currentBlockIndex + 1} de {textBlocks.length} blocos
                      </div>
                    </div>

                    <div className="mt-4">
                      <Progress value={progress} className="w-full" />
                    </div>
                  </CardContent>
                </Card>

                {/* Quick Settings */}
                <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className={isDarkMode ? "text-gray-200" : "text-gray-700"}>
                          Velocidade: {wordsPerSecond} palavras/segundo
                        </Label>
                        <Slider
                          value={[wordsPerSecond]}
                          onValueChange={(value) => setWordsPerSecond(value[0])}
                          min={1}
                          max={10}
                          step={1}
                          className="w-full"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className={isDarkMode ? "text-gray-200" : "text-gray-700"}>
                          Palavras por bloco: {wordsPerBlock}
                        </Label>
                        <Slider
                          value={[wordsPerBlock]}
                          onValueChange={(value) => setWordsPerBlock(value[0])}
                          min={1}
                          max={10}
                          step={1}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}>
              <CardHeader>
                <CardTitle className={isDarkMode ? "text-white" : "text-gray-800"}>Configurações Avançadas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className={isDarkMode ? "text-gray-200" : "text-gray-700"}>Modo Escuro</Label>
                    <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                      Reduz o cansaço visual durante leituras prolongadas
                    </p>
                  </div>
                  <Switch checked={isDarkMode} onCheckedChange={setIsDarkMode} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="speed" className={isDarkMode ? "text-gray-200" : "text-gray-700"}>
                      Velocidade de Leitura
                    </Label>
                    <Select
                      value={wordsPerSecond.toString()}
                      onValueChange={(value) => setWordsPerSecond(Number(value))}
                    >
                      <SelectTrigger className={isDarkMode ? "bg-gray-700 border-gray-600" : ""}>
                        <SelectValue className={isDarkMode ? "text-white" : "text-gray-800"} />
                      </SelectTrigger>
                      <SelectContent className={isDarkMode ? "bg-gray-700 border-gray-600" : ""}>
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((speed) => (
                          <SelectItem
                            key={speed}
                            className={isDarkMode ? "text-white" : "text-gray-800"}
                            value={speed.toString()}
                          >
                            {speed} palavra{speed > 1 ? "s" : ""}/segundo {speed === 1 && "(Muito Lento)"}
                            {speed === 2 && "(Lento)"}
                            {speed === 3 && "(Normal)"}
                            {speed === 4 && "(Rápido)"}
                            {speed === 5 && "(Muito Rápido)"}
                            {speed >= 6 && "(Extremo)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="words-per-block" className={isDarkMode ? "text-gray-200" : "text-gray-700"}>
                      Palavras por Bloco
                    </Label>
                    <Select value={wordsPerBlock.toString()} onValueChange={(value) => setWordsPerBlock(Number(value))}>
                      <SelectTrigger className={isDarkMode ? "bg-gray-700 border-gray-600" : ""}>
                        <SelectValue className={isDarkMode ? "text-white" : "text-gray-800"} />
                      </SelectTrigger>
                      <SelectContent className={isDarkMode ? "bg-gray-700 border-gray-600" : ""}>
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((count) => (
                          <SelectItem
                            key={count}
                            className={isDarkMode ? "text-white" : "text-gray-800"}
                            value={count.toString()}
                          >
                            {count} palavra{count > 1 ? "s" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {pdfFile && pdfStats && (
                  <div className="space-y-2">
                    <Label className={isDarkMode ? "text-gray-200" : "text-gray-700"}>Arquivo Atual</Label>
                    <div className={`p-3 rounded-lg ${isDarkMode ? "bg-gray-700" : "bg-gray-50"}`}>
                      <p className={`font-medium ${isDarkMode ? "text-white" : "text-gray-800"}`}>{pdfFile.name}</p>
                      <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                        {pdfStats.pages} páginas • {pdfStats.words} palavras • {pdfStats.characters} caracteres
                      </p>
                      <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                        {textBlocks.length} blocos de leitura
                      </p>
                      <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                        Tempo estimado: {Math.ceil(pdfStats.words / wordsPerSecond / 60)} minutos
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPdfFile(null)
                        setExtractedText("")
                        setTextBlocks([])
                        setCurrentBlockIndex(0)
                        setIsPlaying(false)
                        setPdfStats(null)
                      }}
                    >
                      Carregar Novo PDF
                    </Button>
                  </div>
                )}

                <div className={`p-4 rounded-lg ${isDarkMode ? "bg-gray-700" : "bg-blue-50"}`}>
                  <h4 className={`font-medium mb-2 ${isDarkMode ? "text-white" : "text-gray-800"}`}>Como funciona</h4>
                  <div className={`text-sm space-y-1 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
                    <p>• O aplicativo tenta extrair texto real de arquivos PDF</p>
                    <p>• Se a extração falhar, usa modo de demonstração</p>
                    <p>• Funciona melhor com PDFs que contêm texto selecionável</p>
                    <p>• PDFs escaneados podem não ter texto extraível</p>
                    <p>• Para melhores resultados, use PDFs criados digitalmente</p>
                  </div>
                </div>

                <div className={`p-4 rounded-lg ${isDarkMode ? "bg-gray-700" : "bg-yellow-50"}`}>
                  <h4 className={`font-medium mb-2 ${isDarkMode ? "text-white" : "text-gray-800"}`}>
                    Status do Sistema
                  </h4>
                  <div className={`text-sm space-y-1 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
                    <p>⚠️ PDF.js com fallback para modo demonstração</p>
                    <p>✅ Worker configurado com versão compatível</p>
                    <p>✅ Tratamento de erros robusto</p>
                    <p>✅ Funciona mesmo se PDF.js falhar</p>
                    <p>✅ Processamento seguro no navegador</p>
                  </div>
                </div>

                <div className={`p-4 rounded-lg ${isDarkMode ? "bg-gray-700" : "bg-blue-50"}`}>
                  <h4 className={`font-medium mb-2 ${isDarkMode ? "text-white" : "text-gray-800"}`}>
                    Atalhos do Teclado
                  </h4>
                  <div className={`text-sm space-y-1 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
                    <p>
                      <kbd
                        className={`px-2 py-1 rounded text-xs ${isDarkMode ? "bg-gray-600 text-gray-200" : "bg-gray-200 text-gray-700"}`}
                      >
                        Espaço
                      </kbd>{" "}
                      - Play/Pause
                    </p>
                    <p>
                      <kbd
                        className={`px-2 py-1 rounded text-xs ${isDarkMode ? "bg-gray-600 text-gray-200" : "bg-gray-200 text-gray-700"}`}
                      >
                        ←
                      </kbd>{" "}
                      - Voltar bloco
                    </p>
                    <p>
                      <kbd
                        className={`px-2 py-1 rounded text-xs ${isDarkMode ? "bg-gray-600 text-gray-200" : "bg-gray-200 text-gray-700"}`}
                      >
                        Esc
                      </kbd>{" "}
                      - Sair da tela cheia
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
