import { PageDetailSkeleton } from '@affine/component/page-detail-skeleton';
import {
  createTagFilter,
  useCollectionManager,
} from '@affine/component/page-list';
import { ResizePanel } from '@affine/component/resize-panel';
import { WorkspaceSubPath } from '@affine/env/workspace';
import { globalBlockSuiteSchema } from '@affine/workspace/manager';
import { SyncEngineStep } from '@affine/workspace/providers';
import { assertExists } from '@blocksuite/global/utils';
import type { EditorContainer } from '@blocksuite/presets';
import type { Page, Workspace } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import {
  appSettingAtom,
  currentPageIdAtom,
  currentWorkspaceIdAtom,
} from '@toeverything/infra/atom';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { type LoaderFunction, useParams } from 'react-router-dom';
import type { Map as YMap } from 'yjs';

import { setPageModeAtom } from '../../../atoms';
import { collectionsCRUDAtom } from '../../../atoms/collections';
import { currentModeAtom } from '../../../atoms/mode';
import { AffineErrorBoundary } from '../../../components/affine/affine-error-boundary';
import { HubIsland } from '../../../components/affine/hub-island';
import { GlobalPageHistoryModal } from '../../../components/affine/page-history-modal';
import { PageDetailEditor } from '../../../components/page-detail-editor';
import { TrashPageFooter } from '../../../components/pure/trash-page-footer';
import { TopTip } from '../../../components/top-tip';
import { useRegisterBlocksuiteEditorCommands } from '../../../hooks/affine/use-register-blocksuite-editor-commands';
import {
  useCurrentSyncEngine,
  useCurrentSyncEngineStatus,
} from '../../../hooks/current/use-current-sync-engine';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import { performanceRenderLogger } from '../../../shared';
import * as styles from './detail-page.css';
import { DetailPageHeader, RightSidebarHeader } from './detail-page-header';
import {
  EditorSidebar,
  editorSidebarOpenAtom,
  editorSidebarResizingAtom,
  editorSidebarStateAtom,
  editorSidebarWidthAtom,
} from './editor-sidebar';

interface DetailPageLayoutProps {
  main: ReactNode;
  header: ReactNode;
  footer: ReactNode;
  sidebar: ReactNode;
}

const MIN_SIDEBAR_WIDTH = 320;
const MAX_SIDEBAR_WIDTH = 800;

// todo: consider move to a shared place if we also want to reuse the layout for other routes
const DetailPageLayout = ({
  main,
  header,
  footer,
  sidebar,
}: DetailPageLayoutProps): ReactElement => {
  const sidebarState = useAtomValue(editorSidebarStateAtom);
  const setSidebarWidth = useSetAtom(editorSidebarWidthAtom);
  const { clientBorder } = useAtomValue(appSettingAtom);
  const setResizing = useSetAtom(editorSidebarResizingAtom);
  const setOpen = useSetAtom(editorSidebarOpenAtom);

  return (
    <div
      className={styles.root}
      data-client-border={clientBorder && sidebarState.isOpen}
    >
      <div className={styles.mainContainer}>
        {header}
        {main}
        {footer}
      </div>
      {sidebar ? (
        <ResizePanel
          enableAnimation={false}
          resizeHandlePos="left"
          resizeHandleOffset={clientBorder ? 4 : 0}
          width={sidebarState.width}
          className={styles.sidebarContainer}
          onResizing={setResizing}
          resizing={sidebarState.resizing}
          open={sidebarState.isOpen}
          onOpen={setOpen}
          onWidthChange={setSidebarWidth}
          minWidth={MIN_SIDEBAR_WIDTH}
          maxWidth={MAX_SIDEBAR_WIDTH}
        >
          {sidebar}
        </ResizePanel>
      ) : null}
    </div>
  );
};

const DetailPageImpl = ({ page }: { page: Page }) => {
  const currentPageId = page.id;
  const { openPage, jumpToSubPath } = useNavigateHelper();
  const [currentWorkspace] = useCurrentWorkspace();
  assertExists(
    currentWorkspace,
    'current workspace is null when rendering detail'
  );
  const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;

  const pageMeta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === page.id
  );

  const isInTrash = pageMeta?.trash;

  const { setTemporaryFilter } = useCollectionManager(collectionsCRUDAtom);
  const mode = useAtomValue(currentModeAtom);
  const setPageMode = useSetAtom(setPageModeAtom);
  useRegisterBlocksuiteEditorCommands(currentPageId, mode);

  const onLoad = useCallback(
    (page: Page, editor: EditorContainer) => {
      try {
        // todo(joooye34): improve the following migration code
        const surfaceBlock = page.getBlockByFlavour('affine:surface')[0];
        // hotfix for old page
        if (
          surfaceBlock &&
          (surfaceBlock.yBlock.get('prop:elements') as YMap<any>).get(
            'type'
          ) !== '$blocksuite:internal:native$'
        ) {
          globalBlockSuiteSchema.upgradePage(
            0,
            {
              'affine:surface': 3,
            },
            page.spaceDoc
          );
        }
      } catch {}
      setPageMode(currentPageId, mode);
      const dispose = editor.slots.pageLinkClicked.on(({ pageId }) => {
        return openPage(blockSuiteWorkspace.id, pageId);
      });
      const disposeTagClick = editor.slots.tagClicked.on(async ({ tagId }) => {
        jumpToSubPath(currentWorkspace.id, WorkspaceSubPath.ALL);
        setTemporaryFilter([createTagFilter(tagId)]);
      });
      return () => {
        dispose.dispose();
        disposeTagClick.dispose();
      };
    },
    [
      blockSuiteWorkspace.id,
      currentPageId,
      currentWorkspace.id,
      jumpToSubPath,
      mode,
      openPage,
      setPageMode,
      setTemporaryFilter,
    ]
  );

  return (
    <>
      <DetailPageLayout
        header={
          <>
            <DetailPageHeader
              page={page}
              workspace={currentWorkspace}
              showSidebarSwitch={!isInTrash}
            />
            <TopTip workspace={currentWorkspace} />
          </>
        }
        main={
          <div className={styles.editorContainer}>
            <PageDetailEditor
              pageId={currentPageId}
              onLoad={onLoad}
              workspace={blockSuiteWorkspace}
            />
            <HubIsland />
          </div>
        }
        footer={isInTrash ? <TrashPageFooter pageId={page.id} /> : null}
        sidebar={
          !isInTrash ? (
            <div className={styles.sidebarContainerInner}>
              <RightSidebarHeader />
              <EditorSidebar />
            </div>
          ) : null
        }
      />
      <GlobalPageHistoryModal />
    </>
  );
};

const useForceUpdate = () => {
  const [, setCount] = useState(0);
  return useCallback(() => setCount(count => count + 1), []);
};
const useSafePage = (workspace: Workspace, pageId: string) => {
  const forceUpdate = useForceUpdate();
  useEffect(() => {
    const disposable = workspace.slots.pagesUpdated.on(() => {
      forceUpdate();
    });
    return disposable.dispose;
  }, [pageId, workspace.slots.pagesUpdated, forceUpdate]);

  return workspace.getPage(pageId);
};

export const DetailPage = ({ pageId }: { pageId: string }): ReactElement => {
  const [currentWorkspace] = useCurrentWorkspace();
  const currentSyncEngineStatus = useCurrentSyncEngineStatus();
  const currentSyncEngine = useCurrentSyncEngine();

  // set sync engine priority target
  useEffect(() => {
    currentSyncEngine?.setPriorityRule(id => id.endsWith(pageId));
  }, [pageId, currentSyncEngine, currentWorkspace]);

  const page = useSafePage(currentWorkspace?.blockSuiteWorkspace, pageId);

  const navigate = useNavigateHelper();

  // if sync engine has been synced and the page is null, wait 1s and jump to 404 page.
  useEffect(() => {
    if (currentSyncEngineStatus?.step === SyncEngineStep.Synced && !page) {
      const timeout = setTimeout(() => {
        navigate.jumpTo404();
      }, 1000);
      return () => {
        clearTimeout(timeout);
      };
    }
    return;
  }, [currentSyncEngineStatus, navigate, page]);

  if (!page) {
    return <PageDetailSkeleton key="current-page-is-null" />;
  }

  if (page.meta.jumpOnce) {
    currentWorkspace.blockSuiteWorkspace.setPageMeta(page.id, {
      jumpOnce: false,
    });
  }

  return <DetailPageImpl page={page} />;
};

export const loader: LoaderFunction = async () => {
  return null;
};

export const Component = () => {
  performanceRenderLogger.info('DetailPage');

  const setCurrentWorkspaceId = useSetAtom(currentWorkspaceIdAtom);
  const setCurrentPageId = useSetAtom(currentPageIdAtom);
  const params = useParams();

  useEffect(() => {
    if (params.workspaceId) {
      localStorage.setItem('last_workspace_id', params.workspaceId);
      setCurrentWorkspaceId(params.workspaceId);
    }
    if (params.pageId) {
      localStorage.setItem('last_page_id', params.pageId);
      setCurrentPageId(params.pageId);
    }
  }, [params, setCurrentPageId, setCurrentWorkspaceId]);

  const pageId = params.pageId;

  // Add a key to force rerender when page changed, to avoid error boundary persisting.
  return (
    <AffineErrorBoundary key={params.pageId}>
      {pageId ? <DetailPage pageId={pageId} /> : null}
    </AffineErrorBoundary>
  );
};