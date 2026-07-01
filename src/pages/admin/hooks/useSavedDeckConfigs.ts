import { useCallback, useEffect, useRef, useState } from 'react';
import type { RawDeckContent } from '@eb-packages/deck-engine';
import type { Template } from '@pdfme/common';
import {
  SavedConfigRepository,
  type SavedConfigApplyOverrides,
  type SavedConfigRow,
} from '../../../lib/deckRepository';
import { getErrorMessage } from '../../../lib/errors';

const savedConfigRepo = new SavedConfigRepository();

function broadcastTemplateUpdated(deckId: string): void {
  try {
    const channel = new BroadcastChannel('baraja_template_updates');
    channel.postMessage({ type: 'TEMPLATE_UPDATED', deckId });
    channel.close();
  } catch (err) {
    console.warn('[useSavedDeckConfigs] Failed to broadcast template update:', err);
  }
}

interface UseSavedDeckConfigsParams {
  activeDeck: RawDeckContent | null | undefined;
  activeTemplate: Template | null | undefined;
  cardWidth: number;
  cardHeight: number;
  hiddenFields: Record<string, boolean>;
  getLiveTemplate: () => Template | undefined;
  onApplyTemplateSnapshot: (
    template: Template,
    cardWidth: number,
    cardHeight: number,
    hiddenFields: Record<string, boolean>,
  ) => void;
  onSelectDeckId: (deckId: string) => void;
  getApplyOverrides?: (config: SavedConfigRow) => SavedConfigApplyOverrides | undefined;
}

export function useSavedDeckConfigs({
  activeDeck,
  activeTemplate,
  cardWidth,
  cardHeight,
  hiddenFields,
  getLiveTemplate,
  onApplyTemplateSnapshot,
  onSelectDeckId,
  getApplyOverrides,
}: UseSavedDeckConfigsParams) {
  const layoutScratchRef = useRef<{
    template: Template;
    cardWidth: number;
    cardHeight: number;
    hiddenFields: Record<string, boolean>;
  } | null>(null);

  const [savedConfigs, setSavedConfigs] = useState<SavedConfigRow[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [applyingConfigId, setApplyingConfigId] = useState<string | null>(null);

  const fetchSavedConfigs = useCallback(async (slug?: string) => {
    if (!slug) {
      setSavedConfigs([]);
      return;
    }

    setLoadingConfigs(true);
    try {
      const configs = await savedConfigRepo.getAll(slug);
      setSavedConfigs(configs);
    } catch (err: unknown) {
      console.error('Failed to fetch saved configs:', err);
    } finally {
      setLoadingConfigs(false);
    }
  }, []);

  useEffect(() => {
    if (activeDeck?.slug) {
      fetchSavedConfigs(activeDeck.slug);
    } else {
      setSavedConfigs([]);
    }

    layoutScratchRef.current = null;
    setSelectedConfigId('');
  }, [activeDeck?.slug, fetchSavedConfigs]);

  const handleSelectConfig = useCallback((configId: string) => {
    setSelectedConfigId(configId);

    if (!configId) {
      const scratch = layoutScratchRef.current;
      if (!scratch) return;

      onApplyTemplateSnapshot(
        scratch.template,
        scratch.cardWidth,
        scratch.cardHeight,
        scratch.hiddenFields,
      );
      layoutScratchRef.current = null;
      return;
    }

    const config = savedConfigs.find(candidate => candidate.id === configId);
    if (!config) return;

    if (!layoutScratchRef.current && activeTemplate) {
      layoutScratchRef.current = {
        template: getLiveTemplate() || activeTemplate,
        cardWidth,
        cardHeight,
        hiddenFields,
      };
    }

    const nextTemplate = config.layout_config && Object.keys(config.layout_config).length > 0
      ? config.layout_config as unknown as Template
      : activeTemplate;

    if (!nextTemplate) return;

    onApplyTemplateSnapshot(
      nextTemplate,
      config.card_width || cardWidth,
      config.card_height || cardHeight,
      config.hidden_fields || hiddenFields,
    );
  }, [
    activeTemplate,
    cardHeight,
    cardWidth,
    getLiveTemplate,
    hiddenFields,
    onApplyTemplateSnapshot,
    savedConfigs,
  ]);

  const saveConfigSnapshot = useCallback(async (
    configName: string,
    options: { notify?: boolean } = {},
  ): Promise<boolean> => {
    if (!activeDeck || !activeTemplate) return false;
    setSavingConfig(true);
    try {
      const liveTemplate = getLiveTemplate() || activeTemplate;

      await savedConfigRepo.create({
        name: configName,
        edition_slug: activeDeck.slug || null,
        design_template_id: activeDeck.design_template_id || null,
        layout_config: liveTemplate as unknown as Record<string, unknown>,
        hidden_fields: hiddenFields,
        card_width: cardWidth,
        card_height: cardHeight,
        card_unit: 'mm',
      });

      await fetchSavedConfigs(activeDeck.slug);
      if (options.notify) {
        alert(`Copia "${configName}" guardada en el historial. Para aplicarla al mazo usá "Aplicar", o usá "Guardar layout" para aplicar lo que ves ahora.`);
      }
      return true;
    } catch (err: unknown) {
      alert('Error guardando config: ' + getErrorMessage(err));
      return false;
    } finally {
      setSavingConfig(false);
    }
  }, [
    activeDeck,
    activeTemplate,
    cardHeight,
    cardWidth,
    fetchSavedConfigs,
    getLiveTemplate,
    hiddenFields,
  ]);

  const handleSaveConfig = useCallback(async () => {
    if (!activeDeck || !activeTemplate) return;

    const configName = prompt(
      'Nombre de la versión de diseño:\n(ej: "Barómetro 6×9 Premium", "Poker Night")',
      `${activeDeck.name} ${cardWidth}×${cardHeight}`
    );
    if (!configName) return;

    await saveConfigSnapshot(configName, { notify: true });
  }, [activeDeck, activeTemplate, cardHeight, cardWidth, saveConfigSnapshot]);

  const handleApplyConfig = useCallback(async (config: SavedConfigRow) => {
    if (!activeDeck) return;
    if (!confirm(`¿Aplicar la versión "${config.name}" a ${activeDeck.name}?\n\nEsto reemplazará el layout, tamaño y campos ocultos actuales para todo el mazo.`)) return;

    setApplyingConfigId(config.id);
    try {
      await savedConfigRepo.applyToEdition(
        config.id,
        activeDeck.slug || activeDeck.id,
        getApplyOverrides?.(config),
      );
      broadcastTemplateUpdated(activeDeck.slug || activeDeck.id);
      onSelectDeckId('');
      setTimeout(() => onSelectDeckId(activeDeck.id), 100);
      alert(`Versión "${config.name}" aplicada al mazo. El editor se recargó.`);
    } catch (err: unknown) {
      alert('Error aplicando config: ' + getErrorMessage(err));
    } finally {
      setApplyingConfigId(null);
    }
  }, [activeDeck, getApplyOverrides, onSelectDeckId]);

  const handleDeleteConfig = useCallback(async (config: SavedConfigRow) => {
    if (!confirm(`¿Eliminar la versión "${config.name}"? Esta acción no se puede deshacer.`)) return;

    try {
      await savedConfigRepo.delete(config.id);
      setSavedConfigs(prev => prev.filter(candidate => candidate.id !== config.id));
    } catch (err: unknown) {
      alert('Error eliminando config: ' + getErrorMessage(err));
    }
  }, []);

  return {
    savedConfigs,
    selectedConfigId,
    loadingConfigs,
    savingConfig,
    applyingConfigId,
    handleSelectConfig,
    handleSaveConfig,
    saveConfigSnapshot,
    handleApplyConfig,
    handleDeleteConfig,
  };
}
