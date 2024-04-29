import { GetServerSideProps } from 'next'
import { useTranslation } from 'next-i18next'
import OmniAural, { useOmniAural } from 'omniaural'
import type { Episode, MediaRef, PVComment, SocialInteraction } from 'podverse-shared'
import {
  addLightningBoltToString,
  checkIfHasSupportedCommentTag,
  checkIfVideoFileOrVideoLiveType,
  getLightningKeysendValueItem
} from 'podverse-shared'
import { useEffect, useRef, useState } from 'react'
import {
  Chapters,
  ChatRoom,
  ClipListItem,
  ColumnsWrapper,
  Comments,
  EpisodeInfo,
  EpisodePageHeader,
  Footer,
  List,
  Meta,
  PageHeader,
  PageScrollableContent,
  Pagination,
  SideContent,
  SideContentSection,
  Transcripts,
  WebLNV4VForm
} from '~/components'
import { scrollToTopOfPageScrollableContent } from '~/components/PageScrollableContent/PageScrollableContent'
import { calcListPageCount } from '~/lib/utility/misc'
import { Page } from '~/lib/utility/page'
import { PV } from '~/resources'
import { getEpisodeById } from '~/services/episode'
import { getMediaRefsByQuery, retrieveLatestChaptersForEpisodeId } from '~/services/mediaRef'
import { getDefaultServerSideProps, getServerSidePropsWrapper } from '~/services/serverSideHelpers'
import { getEpisodeProxyActivityPub, getEpisodeProxyTwitter } from '~/services/socialInteraction/threadcap'
import { OmniAuralState } from '~/state/omniauralState'

interface ServerProps extends Page {
  serverChapters: MediaRef[]
  serverClips: MediaRef[]
  serverClipsFilterPage: number
  serverClipsFilterSort: string
  serverClipsPageCount: number
  serverCookies: any
  serverEpisode: Episode
}

type FilterState = {
  clipsFilterPage?: number
  clipsFilterSort?: string
}

const keyPrefix = 'pages_episode'

/* *TODO*
    Rewrite this file to follow the patterns in pages/podcasts and pages/search.
    Move all functions inside the render function,
    get rid of the filterState,
    stop passing in filterState as a parameter,
    and instead get and set the filterState fields individually.
    Keep the sections in the same order
    (Initialization, useEffects, Client-Side Queries, Render Helpers).
*/

export default function EpisodePage({
  serverChapters,
  serverClips,
  serverClipsFilterPage,
  serverClipsFilterSort,
  serverClipsPageCount,
  serverCookies,
  serverEpisode
}: ServerProps) {
  /* Initialize */

  const { id, liveItem } = serverEpisode
  const isLiveItem = !!liveItem
  const { t } = useTranslation()
  const [filterState, setFilterState] = useState({
    clipsFilterPage: serverClipsFilterPage,
    clipsFilterSort: serverClipsFilterSort
  } as FilterState)
  const [comment, setComment] = useState<PVComment>(null)
  const [commentsLoading, setCommentsLoading] = useState<boolean>(false)
  const [userInfo] = useOmniAural('session.userInfo') as [OmniAuralState['session']['userInfo']]
  const { clipsFilterPage, clipsFilterSort } = filterState
  const [clipsListData, setClipsListData] = useState<MediaRef[]>(serverClips)
  const [clipsPageCount, setClipsPageCount] = useState<number>(serverClipsPageCount)
  const initialRender = useRef(true)

  const hasTranscripts = !!(serverEpisode?.transcript && serverEpisode?.transcript[0])
  const hasValidCommentTag = checkIfHasSupportedCommentTag(serverEpisode)
  const hasChapters = serverChapters.length >= 1
  const hasChatRoom = !!liveItem?.chatIRCURL
  const valueEpisode = serverEpisode.value?.length > 0 ? serverEpisode.value : null
  const valuePodcast = serverEpisode.podcast.value?.length > 0 ? serverEpisode.podcast.value : null
  const value = valueEpisode || valuePodcast
  const valueTag = getLightningKeysendValueItem(value)

  /* useEffects */

  useEffect(() => {
    if (serverEpisode) {
      setTimeout(() => {
        OmniAural.v4vElementInfoSet({
          podcastIndexPodcastId: serverEpisode.podcast.podcastIndexId,
          episodeMediaUrl: serverEpisode.mediaUrl
        })
      }, 0)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      if (serverEpisode?.socialInteraction?.length) {
        const activityPub = serverEpisode.socialInteraction.find(
          (item: SocialInteraction) =>
            item.protocol === PV.SocialInteraction.protocolKeys.activitypub ||
            item.platform === PV.SocialInteraction.platformKeys.activitypub ||
            item.platform === PV.SocialInteraction.platformKeys.castopod ||
            item.platform === PV.SocialInteraction.platformKeys.mastodon ||
            item.platform === PV.SocialInteraction.platformKeys.peertube
        )

        const twitter = serverEpisode.socialInteraction.find(
          (item: SocialInteraction) =>
            item.protocol === PV.SocialInteraction.protocolKeys.twitter ||
            item.platform === PV.SocialInteraction.platformKeys.twitter
        )

        try {
          if (activityPub?.uri || activityPub?.url) {
            setCommentsLoading(true)
            const comment = await getEpisodeProxyActivityPub(serverEpisode.id)
            setComment(comment)
          } else if (twitter?.uri || twitter?.url) {
            setCommentsLoading(true)
            const comment = await getEpisodeProxyTwitter(serverEpisode.id)
            setComment(comment)
          }
        } catch (error) {
          console.log('Comments loading error:', error)
        }
        setCommentsLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    ;(async () => {
      if (initialRender.current) {
        initialRender.current = false
      } else {
        const { data } = await clientQueryClips()
        const [newClipsListData, newClipsListCount] = data
        setClipsListData(newClipsListData)
        setClipsPageCount(calcListPageCount(newClipsListCount))
        scrollToTopOfPageScrollableContent()
      }
    })()
  }, [clipsFilterPage, clipsFilterSort])

  /* Client-Side Queries */

  const clientQueryClips = async () => {
    const finalQuery = {
      episodeId: id,
      ...(clipsFilterPage ? { page: clipsFilterPage } : {}),
      ...(clipsFilterSort ? { sort: clipsFilterSort } : {})
    }
    return getMediaRefsByQuery(finalQuery)
  }

  /* Render Helpers */

  const generateClipListElements = () => {
    return clipsListData.map((listItem, index) => {
      listItem.episode = serverEpisode
      return (
        <ClipListItem
          isLoggedInUserMediaRef={userInfo && userInfo.id === listItem.owner.id}
          mediaRef={listItem}
          key={`${keyPrefix}-${index}-${listItem?.id}`}
        />
      )
    })
  }

  /* Meta Tags */

  let meta = {} as any
  let twitterPlayerUrl = ''
  let isVideo = false

  if (serverEpisode) {
    const { podcast } = serverEpisode
    const podcastTitle = (podcast && podcast.title) || t('untitledPodcast')
    meta = {
      currentUrl: `${PV.Config.WEB_BASE_URL}${PV.RoutePaths.web.episode}/${serverEpisode.id}`,
      description: serverEpisode.description,
      imageAlt: podcastTitle,
      imageUrl: serverEpisode.imageUrl || (podcast && podcast.shrunkImageUrl) || (podcast && podcast.imageUrl),
      title: `${serverEpisode.title} - ${podcastTitle}`
    }
    isVideo = checkIfVideoFileOrVideoLiveType(serverEpisode.mediaType)
    twitterPlayerUrl = isVideo
      ? `${PV.Config.WEB_BASE_URL}${PV.RoutePaths.web.videoplayer.episode}/${serverEpisode.id}`
      : `${PV.Config.WEB_BASE_URL}${PV.RoutePaths.web.miniplayer.episode}/${serverEpisode.id}`
  }

  return (
    <>
      <Meta
        description={meta.description}
        isVideo={isVideo}
        ogDescription={meta.description}
        ogImage={meta.imageUrl}
        ogTitle={meta.title}
        ogType='website'
        ogUrl={meta.currentUrl}
        robotsNoIndex={false}
        title={meta.title}
        twitterDescription={meta.description}
        twitterImage={meta.imageUrl}
        twitterImageAlt={meta.imageAlt}
        twitterPlayerUrl={twitterPlayerUrl}
        twitterTitle={meta.title}
      />
      <EpisodePageHeader episode={serverEpisode} />
      <PageScrollableContent noPaddingTop>
        <ColumnsWrapper
          mainColumnChildren={
            <>
              <EpisodeInfo episode={serverEpisode} includeMediaItemControls />
              {hasTranscripts ? <Transcripts episode={serverEpisode} /> : null}
              {hasValidCommentTag ? <Comments comment={comment} isLoading={commentsLoading} /> : null}
              {hasChatRoom ? <ChatRoom chatIRCURL={liveItem?.chatIRCURL} /> : null}
              {hasChapters ? <Chapters chapters={serverChapters} episode={serverEpisode} /> : null}
              {!isLiveItem && (
                <>
                  <PageHeader
                    isSubHeader
                    noMarginBottom
                    secondaryOnChange={(selectedItems: any[]) => {
                      const selectedItem = selectedItems[0]
                      setFilterState({
                        clipsFilterPage: 1,
                        clipsFilterSort: selectedItem.key
                      })
                    }}
                    secondaryOptions={PV.Filters.dropdownOptions.clip.sort}
                    secondarySelected={clipsFilterSort}
                    text={t('Clips')}
                  />
                  <List>{generateClipListElements()}</List>
                </>
              )}
              <Pagination
                currentPageIndex={clipsFilterPage}
                handlePageNavigate={(newPage) => {
                  setFilterState({ clipsFilterPage: newPage, clipsFilterSort })
                }}
                handlePageNext={() => {
                  const newPage = clipsFilterPage + 1
                  if (newPage <= clipsPageCount) {
                    setFilterState({
                      clipsFilterPage: newPage,
                      clipsFilterSort
                    })
                  }
                }}
                handlePagePrevious={() => {
                  const newPage = clipsFilterPage - 1
                  if (newPage > 0) {
                    setFilterState({
                      clipsFilterPage: newPage,
                      clipsFilterSort
                    })
                  }
                }}
                pageCount={clipsPageCount}
                show={clipsPageCount > 1}
              />
            </>
          }
          sideColumnChildren={
            <SideContent>
              {valueTag && (
                <SideContentSection headerText={addLightningBoltToString(t('Value-4-Value'))}>
                  <WebLNV4VForm
                    episode={serverEpisode}
                    podcast={serverEpisode.podcast}
                    serverCookies={serverCookies}
                    valueTag={valueTag}
                  />
                </SideContentSection>
              )}
            </SideContent>
          }
        />
        <Footer />
      </PageScrollableContent>
    </>
  )
}

/* Server-Side Logic */

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  return await getServerSidePropsWrapper(async () => {
    const { locale, params } = ctx
    const { episodeId } = params
  
    const [defaultServerProps, episodeResponse] = await Promise.all([
      getDefaultServerSideProps(ctx, locale),
      getEpisodeById(episodeId as string)
    ])
  
    const serverEpisode = episodeResponse.data
  
    const serverClipsFilterSort = PV.Filters.sort._mostRecent
    const serverClipsFilterPage = 1
  
    const clipsResponse = await getMediaRefsByQuery({
      episodeId,
      sort: serverClipsFilterSort
    })
    const [clipsListData, clipsListDataCount] = clipsResponse.data
    const serverClips = clipsListData
    const serverClipsPageCount = calcListPageCount(clipsListDataCount)
  
    let serverChapters = []
    if (serverEpisode.chaptersUrl) {
      const data = await retrieveLatestChaptersForEpisodeId(serverEpisode.id)
      const [chapters] = data
      serverChapters = chapters
    }
  
    const props: ServerProps = {
      ...defaultServerProps,
      serverChapters,
      serverClips,
      serverClipsFilterPage,
      serverClipsFilterSort,
      serverClipsPageCount,
      serverEpisode
    }
  
    return { props }
  })
}
