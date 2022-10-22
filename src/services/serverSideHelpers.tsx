import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { PV } from '~/resources'
import { getServerSideAuthenticatedUserInfo } from '~/services/auth'
import { getServerSideUserQueueItems } from '~/services/userQueueItem'
import { getServerSideHistoryItemsIndex } from '~/services/userHistoryItem'

export const getDefaultServerSideProps = async (ctx: any, locale: any) => {
  const serverCookies = ctx.req.cookies || {}

  const [serverHistoryItemsIndex, serverUserInfo, serverUserQueueItems] = await Promise.all([
    getServerSideHistoryItemsIndex(serverCookies),
    getServerSideAuthenticatedUserInfo(serverCookies),
    getServerSideUserQueueItems(serverCookies)
  ])

  const serverGlobalFiltersString = serverCookies.globalFilters
  type GlobalFilters = {
    videoOnlyMode: boolean
  }
  let serverGlobalFilters: GlobalFilters = { videoOnlyMode: false }
  if (serverGlobalFiltersString) {
    try {
      serverGlobalFilters = JSON.parse(serverGlobalFiltersString)
    } catch (err) {
      // do nothing
    }
  }

  let transObj = { _nextI18Next: null }
  if (!PV.Config.MAINTENANCE_MODE) {
    transObj = await serverSideTranslations(locale, PV.i18n.fileNames.common as any)
  }

  return {
    serverCookies: serverCookies ?? null,
    ...transObj,
    serverGlobalFilters: serverGlobalFilters ?? null,
    serverHistoryItemsIndex: serverHistoryItemsIndex ?? null,
    serverUserInfo: serverUserInfo ?? null,
    serverUserQueueItems: serverUserQueueItems ?? null
  }
}

export const getDefaultEmbedServerSideProps = async (ctx: any, locale: any) => {
  let transObj = { _nextI18Next: null }
  if (!PV.Config.MAINTENANCE_MODE) {
    transObj = await serverSideTranslations(locale, PV.i18n.fileNames.common as any)
  }

  return {
    ...transObj
  }
}
