import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useNotification } from "../hooks/useNotification";
import { useProductNavigation } from "../hooks/useProductNavigation";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";
import EmptyState from "../components/EmptyState";
import ConjuntoGallery from "../components/ConjuntoGallery";
import { getImageUrl as utilGetImageUrl } from "../utils/imageUtils";
import ImageLightbox from "../components/ImageLightbox";
import Header from "../components/Header";
import { useCatalogState } from "../contexts/CatalogContext";
import { fetchProductDetails } from "../services/productService";
import ProductTransition from "../components/ProductTransition";
import NavigationProgress from "../components/NavigationProgress";
import "../styles/CatalogPage.css";
import "../styles/ProductDetails.css";
import caixasImg from "../assets/caixas_2.webp";

function ProductDetailsPage() {
  const { code } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const notify = useNotification();

  // removido catalogState (não utilizado)
  const { preloadState, getFromProductsCache } = useCatalogState();

  // removidos canGoBackTo, goBack, cameFromProduct (não utilizados)
  const {
    navigateToProduct,
    navigateToConjuntoPiece,
    navigateToMembershipConjunto,
    goBackToPreviousProduct,
    clearHistory,
  } = useProductNavigation();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("conjuntos");
  const [isNavigating, setIsNavigating] = useState(false);

  const lastLoadedCode = useRef(null);
  const loadingTimeoutRef = useRef(null);

  // refs para evitar dependências instáveis no loadData
  const dataRef = useRef(null);
  const loadingRef = useRef(false);
  const lastTabSetCodeRef = useRef(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const loadData = useCallback(async () => {

    // Limpa timeout anterior
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }

    try {
      loadingRef.current = true;
      setLoading(true);
      setError("");

      if (!code || typeof code !== "string" || code.trim().length === 0) {
        throw new Error("Código do produto inválido");
      }

      // Evita recarregar o mesmo produto
      if (lastLoadedCode.current === code && dataRef.current) {
        loadingRef.current = false;
        setLoading(false);
        return;
      }

      // Timeout de fallback para loading
      loadingTimeoutRef.current = setTimeout(() => {
        if (loadingRef.current) {
          console.warn(`Timeout no carregamento do produto ${code}`);
          loadingRef.current = false;
          setLoading(false);
          notify.warning("Carregamento está demorando mais que o esperado...");
        }
      }, 5000);

      // Primeiro, tenta obter do cache
      let usedSnapshot = false;

      // Se temos snapshot pré-carregado, extrai dados completos (conjuntos, aplicacoes, etc)
      if (preloadState && preloadState.loaded && preloadState.snapshot) {
        const snap = preloadState.snapshot;
        const normalizedCode = String(code || "").toUpperCase().replace(/\s+/g, "").trim();

        // Procura o produto no snapshot (usar sempre, mesmo se cache tem)
        let product = (Array.isArray(snap.products) ? snap.products : []).find(
          (p) =>
            String(p.codigo || p.code || p.id || "")
              .toUpperCase()
              .replace(/\s+/g, "")
              .trim() === normalizedCode
        );

        // Se não encontrou como produto, pode ser um conjunto pai
        if (!product) {
          const conjuntoRelations = (Array.isArray(snap.conjuntos) ? snap.conjuntos : []).filter(
            (c) =>
              String(c.pai || c.codigo_conjunto || "")
                .toUpperCase()
                .replace(/\s+/g, "") === normalizedCode
          );
          if (conjuntoRelations.length > 0) {
            product = (Array.isArray(snap.products) ? snap.products : []).find(
              (p) =>
                String(p.codigo || p.code || p.id || "")
                  .toUpperCase()
                  .replace(/\s+/g, "")
                  .trim() === normalizedCode
            );
          }
        }

        // Se encontrou no snapshot, extrai TODOS os dados relacionados
        if (product) {
          const conjuntos = (Array.isArray(snap.conjuntos)
            ? snap.conjuntos
              .filter(
                (c) =>
                  String(c.pai || c.codigo_conjunto || "")
                    .toUpperCase()
                    .replace(/\s+/g, "") === normalizedCode
              )
              .map((c) => ({
                filho: c.filho || c.codigo || c.codigo_componente || "",
                filho_des: c.filho_des || c.descricao || c.des || null,
                qtd_explosao: c.qtd_explosao || c.quantidade || c.qtd || 1,
              }))
            : []);

          const aplicacoes = (Array.isArray(snap.aplicacoes)
            ? snap.aplicacoes.filter(
              (a) =>
                String(a.codigo_conjunto || "")
                  .toUpperCase()
                  .replace(/\s+/g, "") === normalizedCode
            )
            : []);

          const benchmarks = (Array.isArray(snap.benchmarks)
            ? snap.benchmarks.filter(
              (b) =>
                String(b.codigo || "")
                  .toUpperCase()
                  .replace(/\s+/g, "") === normalizedCode
            )
            : []);

          const memberships = (Array.isArray(snap.conjuntos)
            ? snap.conjuntos
              .filter(
                (c) =>
                  String(c.filho || "")
                    .toUpperCase()
                    .replace(/\s+/g, "") === normalizedCode
              )
              .map((c) => ({
                codigo_conjunto: c.pai || c.codigo_conjunto || "",
                quantidade: c.qtd_explosao || c.quantidade || c.qtd || 1,
              }))
            : []);

          setData({ data: { product, conjuntos, aplicacoes, benchmarks, memberships } });
          usedSnapshot = true;
          lastLoadedCode.current = code;
        }
      }

      // Se NÃO encontrou no snapshot, tenta API
      if (!usedSnapshot) {
        try {
          const result = await fetchProductDetails(code);
          if (result && typeof result === "object") {
            setData(result);
            lastLoadedCode.current = code;
          }
        } catch (apiErr) {
          console.error("ProductDetailsPage: API failed:", apiErr);
          throw new Error(`Produto não encontrado: ${code}`);
        }
      } else {
        console.log(" ProductDetailsPage: Skipping API call since snapshot data was found");
      }
    } catch (err) {
      const errorMsg = err?.message || "Erro desconhecido ao carregar detalhes";
      console.error("Erro ao carregar detalhes:", errorMsg);
      notify.error(errorMsg);
      setError(errorMsg);
      setData(null);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    }
  }, [code, notify, preloadState]);

  useEffect(() => {
    loadData();
    return () => {
      // cleanup timeout and reset cache so reopening same code triggers fetch
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      lastLoadedCode.current = null;
      dataRef.current = null;
    };
  }, [loadData]);

  // Rola para o topo quando muda o produto
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [code]);

  // Define aba inicial ao carregar/atualizar os dados do produto
  /* eslint-disable react-hooks/exhaustive-deps */
  // searchParams/setSearchParams intentionally omitted – including them causes infinite loops
  useEffect(() => {
    if (!data) return;

    // Só executa a lógica de aba inicial se ainda não foi feito para este produto
    if (lastTabSetCodeRef.current === code) return;
    lastTabSetCodeRef.current = code;

    const context = searchParams.get("context");

    if (context === "from-conjunto") {
      const memberships = getMemberships(data);
      if (memberships.length > 0) {
        setActiveTab("memberships");
        setSearchParams(new URLSearchParams(), { replace: true });
        return;
      }
    } else if (context === "from-piece") {
      const conjuntos = getConjuntos(data);
      if (conjuntos.length > 0) {
        setActiveTab("conjuntos");
        setSearchParams(new URLSearchParams(), { replace: true });
        return;
      }
    }

    // Lógica padrão de prioridade (apenas na primeira carga deste produto)
    const conjuntos = getConjuntos(data);
    const memberships = getMemberships(data);

    if (conjuntos.length > 0) {
      setActiveTab("conjuntos");
    } else if (memberships.length > 0) {
      setActiveTab("memberships");
    } else if (getBenchmarks(data).length > 0) {
      setActiveTab("benchmarks");
    } else if (getAplicacoes(data).length > 0) {
      setActiveTab("aplicacoes");
    }
  }, [data, code]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Funções auxiliares para extrair dados
  const getProduct = (data) => {
    const result = data?.data?.product || data?.product;
    return result;
  };
  const getConjuntos = (data) => {
    const raw = data?.data?.conjuntos || data?.conjuntos || [];
    return Array.isArray(raw) ? raw : [];
  };
  const getMemberships = (data) => {
    const raw = data?.data?.memberships || data?.memberships || [];
    return Array.isArray(raw) ? raw : [];
  };
  const getBenchmarks = (data) => {
    const raw = data?.data?.benchmarks || data?.benchmarks || [];
    return Array.isArray(raw) ? raw : [];
  };
  const getAplicacoes = (data) => {
    const raw = data?.data?.aplicacoes || data?.aplicacoes || [];
    return Array.isArray(raw) ? raw : [];
  };

  // Normaliza conjuntos
  const normalizeConjuntoItem = (c) => {
    if (!c || typeof c !== "object") return null;
    const filho = (c.filho || c.codigo || c.code || c.child || c.filho_codigo || "").toString();
    const filho_des = c.filho_des || c.descricao || c.des || c.nome || "";
    const qtd_explosao = c.qtd_explosao ?? c.quantidade ?? c.qtd ?? 1;
    return { ...c, filho, filho_des, qtd_explosao };
  };

  const product = getProduct(data);
  const conjuntos = getConjuntos(data);
  const normalizedConjuntos = conjuntos.map(normalizeConjuntoItem).filter(Boolean);
  const validConjuntos = normalizedConjuntos.filter((c) => String(c.filho).trim() !== "");
  const memberships = getMemberships(data);
  const benchmarks = getBenchmarks(data);
  const aplicacoes = getAplicacoes(data);

  // Enriquece memberships com nomes
  const enrichedMemberships = memberships.map((membership) => {
    const cachedProduct = getFromProductsCache(membership.codigo_conjunto);
    return {
      ...membership,
      nome_conjunto: cachedProduct?.descricao || `Conjunto ${membership.codigo_conjunto}`,
    };
  });

  const handleBackClick = useCallback(() => {
    setIsNavigating(true);

    // When leaving the page we want to clear the lastLoadedCode so that
    // reopening the same product forces a reload. This fixes the issue where
    // returning and clicking on the same item had no effect.
    lastLoadedCode.current = null;
    dataRef.current = null;

    // Tenta voltar usando o sistema de navegação
    const success = goBackToPreviousProduct("/");

    // Fallback visual se não houver navegação imediata
    setTimeout(() => setIsNavigating(false), 300);

    return success;
  }, [goBackToPreviousProduct]);

  const handlePieceClick = useCallback(
    (pieceCode, contextType = "from-conjunto") => {
      if (!pieceCode) return;

      setIsNavigating(true);
      setLightboxOpen(false);

      if (contextType === "from-conjunto") {
        navigateToConjuntoPiece(pieceCode, code);
      } else if (contextType === "from-piece") {
        navigateToMembershipConjunto(pieceCode, code);
      } else {
        navigateToProduct(pieceCode, { type: contextType });
      }

      // Reset do estado de navegação após delay
      setTimeout(() => setIsNavigating(false), 300);
    },
    [code, navigateToConjuntoPiece, navigateToMembershipConjunto, navigateToProduct]
  );

  const handleCopyCode = useCallback(() => {
    if (product?.codigo) {
      navigator.clipboard.writeText(product.codigo);
      notify.success("Código copiado!");
    }
  }, [product?.codigo, notify]);

  const getImageUrl = useCallback(() => {
    if (!product?.codigo) return "";
    return utilGetImageUrl(product.codigo);
  }, [product?.codigo]);

  const handlePrint = useCallback(() => {
    if (!product) return;

    const logoPath = '/logo192.png';
    const productImage = getImageUrl();

    const renderItemsList = (items) => {
      const useColumns = items.length > 10;
      const colCount = items.length > 20 ? 3 : 2;
      const style = useColumns ? `column-count: ${colCount}; column-gap: 24px;` : '';
      return `<ul class="print-list" style="${style}">${items
        .map((it) => `<li><strong>${it.filho || it.codigo || it.codigo_conjunto || it.numero_original || it.veiculo || ''}</strong> — ${it.filho_des || it.descricao || it.nome_conjunto || it.origem || it.fabricante || ''} ${it.modelo ? '- ' + it.modelo : ''} ${it.ano ? '(' + it.ano + ')' : ''}</li>`)
        .join('')}</ul>`;
    };

    const style = `
      body{font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial; color:#222; margin:0}
      .page{padding:28px;box-sizing:border-box;width:100%;}
      .header{display:flex;gap:18px;align-items:center;margin-bottom:10px}
      .logo{width:88px;height:88px;object-fit:contain}
      .title{font-size:30px;font-weight:800;margin:0}
      .subtitle{font-size:16px;color:#444;margin-top:6px}
      .meta-line{margin-top:8px;font-size:14px;color:#333}
      .divider{height:1px;background:#e6e6e6;margin:12px 0}
      .product-image-large{width:100%;height:540px;object-fit:contain;border:1px solid #eee;padding:10px;background:#fff}
      h2.section-title{font-size:22px;margin:0 0 8px 0}
      .print-list{list-style:none;padding:0;margin:0;line-height:1.7}
      .print-list li{padding:8px 0;border-bottom:1px solid #f0f0f0}
      .print-table{width:100%;border-collapse:collapse}
      .print-table th,.print-table td{border:1px solid #e6e6e6;padding:8px;text-align:left}
      .page-break{page-break-after:always}
      @page { margin: 18mm }
      @media print{ .page{padding:12mm} .logo{width:72px;height:72px} }
    `;

    // Build pages
    let pages = [];

    // First page: main product and large image
    pages.push(`
      <div class="page">
        <div class="header">
          <img src="${logoPath}" class="logo" alt="Logo" />
          <div>
            <h1 class="title">${product.descricao || ''}</h1>
            <div class="subtitle">Código: <strong>${product.codigo || ''}</strong> &nbsp; • &nbsp; Grupo: <strong>${product.grupo || '—'}</strong></div>
            <div class="meta-line">Gerado em: ${new Date().toLocaleString()}</div>
          </div>
        </div>
        <div class="divider"></div>
        <div>
          <img src="${productImage}" class="product-image-large" alt="${product.codigo || ''} - ${product.descricao || ''}" />
        </div>
      </div>
      <div class="page-break"></div>
    `);

    // Sections - each section starts on new page; if > 10 items, divide in columns
    const sections = [
      { key: 'Peças do Conjunto', items: validConjuntos },
      { key: 'Usado em Conjuntos', items: enrichedMemberships },
      { key: 'Benchmarks', items: benchmarks },
      { key: 'Aplicações', items: aplicacoes },
    ];

    sections.forEach((sec) => {
      const items = Array.isArray(sec.items) ? sec.items : [];
      if (items.length === 0) return;
      pages.push(`
        <div class="page">
          <div class="header">
            <img src="${logoPath}" class="logo" alt="Logo" />
            <div>
              <h2 class="section-title">${sec.key}</h2>
            </div>
          </div>
          <div class="divider"></div>
          ${renderItemsList(items)}
        </div>
        <div class="page-break"></div>
      `);
    });

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Ficha - ${product.codigo || ''}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${style}</style></head><body>${pages.join('')}</body></html>`;

    const w = window.open('', '_blank');
    if (!w) {
      notify.error('Não foi possível abrir a janela de impressão. Verifique bloqueadores de pop-up.');
      return;
    }

    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.onload = () => {
      setTimeout(() => {
        try { w.print(); } catch (e) { console.warn('Erro ao imprimir:', e); }
        try { w.close(); } catch (e) { }
      }, 500);
    };
  }, [product, getImageUrl, validConjuntos, enrichedMemberships, benchmarks, aplicacoes, notify]);

  return (
    <>
      <NavigationProgress isActive={isNavigating} />

      <Header
        showLogo={true}
        title="Detalhes do Produto"
        showBackButton={true}
        onBackClick={handleBackClick}
        onLogoClick={clearHistory}
        backButtonDisabled={isNavigating}
      />

      <ProductTransition productCode={code} isNavigating={isNavigating}>
        <main className="product-details-main">
          <div className="product-navigation">
            <div className="navigation-actions">
              <button
                className="action-btn copy-btn"
                onClick={handleCopyCode}
                title="Copiar código"
                disabled={isNavigating}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>Copiar Código</span>
              </button>

              <a href="https://abr-ind.vercel.app/" className="abr-link" target="_blank" rel="noopener noreferrer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                <span>Site ABR</span>
              </a>
            </div>
          </div>

          {loading && (
            <div className="product-loading-container">
              <LoadingSpinner variant="details" />
              <p className="loading-text">Carregando detalhes do produto...</p>
            </div>
          )}

          {error && !loading && (
            <div className="product-error-container">
              <ErrorMessage error={error} onRetry={loadData} variant="banner" />
            </div>
          )}

          {!loading && !error && product && (
            <div className="product-details-container">
              <div className="product-header">
                <div className="product-header-info">
                  <h1 className="product-title">{product.descricao}</h1>
                  <div className="product-subtitle">
                    <div className="product-code">
                      <span className="code-label">Código:</span>
                      <span
                        className="code-value"
                        onClick={handleCopyCode}
                        style={{ cursor: "pointer" }}
                        title="Clique para copiar"
                      >
                        {product.codigo}
                      </span>
                    </div>
                    <div className="product-group">
                      <span className="group-label">Grupo:</span>
                      <span className="group-value">{product.grupo || "Não especificado"}</span>
                    </div>
                  </div>
                </div>

                {product.grupo === "JOGOS DE JUNTAS" && (
                  <div className="product-header-desktop-image" aria-hidden="true">
                    <img src={caixasImg} alt="" loading="lazy" />
                  </div>
                )}

                <div className="product-image-preview">
                  {!imageError ? (
                    <div className="product-image-wrapper" onClick={() => setLightboxOpen(true)}>
                      <img
                        src={getImageUrl()}
                        alt={`${product.codigo} - ${product.descricao}`}
                        className="product-main-image"
                        onError={() => setImageError(true)}
                        loading="lazy"
                      />
                      <div className="image-overlay">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                          <circle cx="11" cy="11" r="8" />
                          <path d="m21 21-4.35-4.35" />
                        </svg>
                        <span>Clique para ampliar</span>
                      </div>
                    </div>
                  ) : (
                    <div className="product-image-placeholder">
                      <div className="placeholder-icon">📷</div>
                      <div className="placeholder-text">Imagem não disponível</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="product-tabs">
                {validConjuntos.length > 0 && (
                  <button
                    className={`tab-btn ${activeTab === "conjuntos" ? "active" : ""}`}
                    onClick={() => setActiveTab("conjuntos")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 0C1.46 6.7 1.33 10.28 4 13l8 8 8-8c2.67-2.72 2.54-6.3.42-8.42z" />
                    </svg>
                    Peças do Conjunto
                    <span className="badge">{validConjuntos.length}</span>
                  </button>
                )}

                {memberships.length > 0 && (
                  <button
                    className={`tab-btn ${activeTab === "memberships" ? "active" : ""}`}
                    onClick={() => setActiveTab("memberships")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    Usado em Conjuntos
                    <span className="badge">{memberships.length}</span>
                  </button>
                )}

                {benchmarks.length > 0 && (
                  <button
                    className={`tab-btn ${activeTab === "benchmarks" ? "active" : ""}`}
                    onClick={() => setActiveTab("benchmarks")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    Benchmarks
                    <span className="badge">{benchmarks.length}</span>
                  </button>
                )}

                {aplicacoes.length > 0 && (
                  <button
                    className={`tab-btn ${activeTab === "aplicacoes" ? "active" : ""}`}
                    onClick={() => setActiveTab("aplicacoes")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                    Aplicações
                    <span className="badge">{aplicacoes.length}</span>
                  </button>
                )}
              </div>

              <div className="tab-content">
                {activeTab === "conjuntos" && (
                  <div className="conjuntos-content">
                    <div className="section-header">
                      <h2>Peças do Conjunto</h2>
                      <p>Clique em uma peça para ver detalhes</p>
                    </div>

                    {validConjuntos.length === 0 ? (
                      <div className="conjuntos-empty">
                        <EmptyState message="Nenhuma peça vinculada a este produto" actionLabel="—" />
                      </div>
                    ) : (
                      <ConjuntoGallery
                        conjuntos={validConjuntos}
                        onPieceClick={(codigo) => handlePieceClick(codigo, "from-conjunto")}
                        isLoading={isNavigating}
                      />
                    )}
                  </div>
                )}

                {activeTab === "memberships" && memberships.length > 0 && (
                  <div className="conjuntos-content">
                    <div className="section-header">
                      <h2>Usado em Conjuntos</h2>
                      <p>Clique em um conjunto para ver detalhes</p>
                    </div>

                    <ConjuntoGallery
                      conjuntos={enrichedMemberships.map((m) => ({
                        filho: m.codigo_conjunto,
                        filho_des: m.nome_conjunto,
                        qtd_explosao: m.quantidade || 1,
                      }))}
                      onPieceClick={(codigo) => handlePieceClick(codigo, "from-piece")}
                      isLoading={isNavigating}
                    />
                  </div>
                )}

                {activeTab === "benchmarks" && benchmarks.length > 0 && (
                  <div className="benchmarks-content">
                    <div className="section-header">
                      <h2>Benchmarks do Produto</h2>
                      <p>Números originais e similares correspondentes</p>
                    </div>
                    <div className="benchmarks-table">
                      <div className="table-header">
                        <div className="header-cell">Número Original</div>
                        <div className="header-cell">Origem / Fabricante</div>
                        <div className="header-cell">Tipo</div>
                      </div>
                      {benchmarks.map((b) => (
                        <div key={b.id} className="table-row">
                          <div className="table-cell original-number">
                            <strong>{b.numero_original || "—"}</strong>
                          </div>
                          <div className="table-cell">{b.origem || "—"}</div>
                          <div className="table-cell">{b.tipo || "Similar"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === "aplicacoes" && (
                  <div className="aplicacoes-content">
                    <div className="section-header">
                      <h2>Aplicações do Produto</h2>
                      <p>Veículos e equipamentos onde este produto é utilizado</p>
                    </div>

                    {aplicacoes.length === 0 ? (
                      <div className="aplicacoes-empty">
                        <EmptyState message="Nenhuma aplicação encontrada para este produto" actionLabel="—" />
                      </div>
                    ) : (
                      <div className="aplicacoes-grid">
                        {aplicacoes.map((a, i) => {
                          const veiculo = a.veiculo || a.veiculo_nome || "Veículo não especificado";
                          const fabricante = a.fabricante || a.marca || "Fabricante não especificado";
                          const modelo = a.modelo || a.model || null;
                          const ano = a.ano || a.year || null;
                          const key = a.id || `${veiculo}-${fabricante}-${i}`;

                          return (
                            <div key={key} className="aplicacao-card">
                              <div className="aplicacao-header">
                                <h3>{veiculo}</h3>
                                <span className="aplicacao-type">{a.tipo || "—"}</span>
                              </div>
                              <div className="aplicacao-details">
                                <div className="aplicacao-info">
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path d="M20 7h-9" />
                                    <path d="M14 17H5" />
                                    <circle cx="17" cy="17" r="3" />
                                    <circle cx="7" cy="7" r="3" />
                                  </svg>
                                  <span>{fabricante}</span>
                                </div>

                                {modelo && (
                                  <div className="aplicacao-info">
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    >
                                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                      <line x1="3" y1="9" x2="21" y2="9" />
                                      <line x1="9" y1="21" x2="9" y2="9" />
                                    </svg>
                                    <span>Modelo: {modelo}</span>
                                  </div>
                                )}

                                {ano && (
                                  <div className="aplicacao-info">
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    >
                                      <circle cx="12" cy="12" r="10" />
                                      <polyline points="12 6 12 12 16 14" />
                                    </svg>
                                    <span>Ano: {ano}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="product-actions-footer">
                <button className="action-btn secondary" onClick={handleBackClick} disabled={isNavigating}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  {isNavigating ? "Voltando..." : "Voltar ao Catálogo"}
                </button>

                <div className="action-group">
                  <button className="action-btn" onClick={handlePrint} disabled={isNavigating}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 6 2 18 2 18 9" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    Imprimir
                  </button>

                  <button className="action-btn primary" onClick={handleCopyCode} disabled={isNavigating}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copiar Código
                  </button>
                </div>
              </div>
            </div>
          )}

          {!loading && !error && !product && (
            <div className="product-not-found">
              <EmptyState message="Produto não encontrado" onAction={handleBackClick} actionLabel="Voltar ao Catálogo" />
            </div>
          )}
        </main>
      </ProductTransition>

      {product && (
        <ImageLightbox
          isOpen={lightboxOpen}
          imageSrc={getImageUrl()}
          alt={`${product.codigo} - ${product.descricao}`}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}

export default ProductDetailsPage;
