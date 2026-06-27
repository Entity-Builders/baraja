import { GenerateEditionConsole } from './components/GenerateEditionConsole';
import { GenerateEditionForm } from './components/GenerateEditionForm';
import { GenerateEditionHeader } from './components/generate-edition/GenerateEditionHeader';
import { GenerationAnimationStyles } from './components/generate-edition/GenerationAnimationStyles';
import { useGenerateEditionController } from './hooks/useGenerateEditionController';

export default function AdminGenerateEdition() {
  const { formProps, consoleProps } = useGenerateEditionController();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'white' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>
        <GenerateEditionHeader />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <GenerateEditionForm {...formProps} />
          <GenerateEditionConsole {...consoleProps} />
        </div>
      </div>

      <GenerationAnimationStyles />
    </div>
  );
}
