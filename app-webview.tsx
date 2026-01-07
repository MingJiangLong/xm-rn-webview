import { useRef } from "react";
import WebView from "react-native-webview";
import { Linking, StyleProp, ViewStyle } from "react-native";
import {
    PermissionCode, usePermission, useLocation, useImagePicker,
    useContact, useAppReview, useCalendar, createRiskBuilder, useDeviceInfo
} from 'xm-rn'


// isH5Login
const NOT_NEED_REPLAY = "__NOT_NEED_REPLAY__"
const REPLAY_WAIT_APP_CALLBACK = "__REPLAY_WAIT_APP_CALLBACK__"
export const H5Events = {
    getAllPermission: "getAllPermission",
    getPermission: "getPermission",
    openAppSettings: "openAppSettings",
    imageFromGallery: "imageFromGallery",
    imageFromCamera: "imageFromCamera",
    launchUrl: "launchUrl",
    pickContact: "pickContact",
    requestInAppReview: "requestInAppReview",
    uploadAllDeviceData: "uploadAllDeviceData",
    uploadDeviceData: "uploadDeviceData",
    logOut: "logOut",
    getEnv: "getEnv",
    getUser: "getUser",
    addCalendar: "addCalendar",
    openOCR: "openOCR",
    webLoginSuccess: "webLoginSuccess",
    getLocation: "getLocation",
    ocrResponse: "ocrResponse",
    reload: "reload",
}

interface I_AppWebViewEnv {
    url: string
    i18n: string
    country: string
    afId: string
    statusBarHeight: number
    ownerShip: string
    openOCR: boolean
    hybridVersion?: number
    firstKey: string

    permissionModule?: ReturnType<typeof usePermission>
    locationModule?: ReturnType<typeof useLocation>
    imagePickerModule?: ReturnType<typeof useImagePicker>
    contactModule?: ReturnType<typeof useContact>
    appReviewModule?: ReturnType<typeof useAppReview>
    calendarModule?: ReturnType<typeof useCalendar>
    deviceInfoModule?: ReturnType<typeof useDeviceInfo>

    permissions?: PermissionCode[]

    builder: ReturnType<typeof createRiskBuilder>

    onLogout: () => Promise<void>
    onWebLoginSuccess: (loginInfo?: any) => void
    onOpenOCR: (data: any) => void
    onGetUserInfo: () => { token: string; cellular: string; uuid: string; userIsTester: string }
    onUpload: (data: any) => Promise<void>
    onGetSupermarketUrl: () => Promise<string>

    webviewStyle?: StyleProp<ViewStyle>
}
export function AppWebView(
    props: I_AppWebViewEnv
) {

    const {

        permissionModule,
        locationModule,
        imagePickerModule,
        contactModule,
        appReviewModule,
        calendarModule,
        deviceInfoModule,

        permissions = [],
        onLogout, onWebLoginSuccess, onOpenOCR, onGetUserInfo, onUpload, builder, onGetSupermarketUrl,
        url,
        i18n, country, afId,
        statusBarHeight, ownerShip, openOCR,
        hybridVersion = 1, firstKey,

    } = props;
    const webviewRef = useRef<WebView>(null);
    function replayMessage(eventType: string, data: any) {
        if (!webviewRef.current) {
            return console.error(`[xm-rn-webview]: 回复事件失败!,webview ref不存在!`);
        };

        // 不需要回复
        if (data === NOT_NEED_REPLAY) {
            return console.log(`[xm-rn-webview]: ${eventType}事件结束-->无需回复)`);
        }

        // 需要等待App主动回复
        if (data === REPLAY_WAIT_APP_CALLBACK) {
            return console.log(`[xm-rn-webview]: ${eventType}已事件执行-->等待app主动回复)`);
        }
        console.log(`[xm-rn-webview]: 回复${eventType}-->${JSON.stringify(data)})`);
        webviewRef.current.injectJavaScript(`window?.postMsg("${eventType}",  JSON.stringify(${JSON.stringify(data)}));`,)
    }

    /**
     * 格式化H5事件
     * @param value 
     * @returns 
     */
    function parseH5Event<T = any>(value: any) {
        try {
            return JSON.parse(value) as { type: keyof typeof H5Events, data: T };
        } catch (error: any) {
            throw new Error(`[xm-rn-webview]: 解析事件失败!,事件字符串: ${value}`)
        }
    }
    /**
     * 从H5接受到消息
     */
    async function receiveMessageFromH5(event: any) {
        try {

            const eventInfo = parseH5Event(event.nativeEvent.data);
            const eventType = eventInfo.type;
            const eventData = eventInfo.data;
            console.log(`[xm-rn-webview]: 接收事件${eventType}-->${eventData})`);
            const isPermissionDeniedForever = (value: any) => value == "blocked" || value === "limited" || value === "unavailable"
            if (eventType === H5Events.getAllPermission) {
                if (!permissionModule) return console.error(`[xm-rn-webview]: 未注入权限模块`);
                const result = await permissionModule.requestMultiplePermissions(permissions ?? []);
                const responseData = {
                    isGranted: result.every(item => item.status === "granted" || item.status == "ignored_permission"),
                    isPermanentlyDenied: result.some(item => isPermissionDeniedForever(item.status)),
                    rejectPermission: result.filter(item => (item.status != "granted" && item.status != "ignored_permission")).map(item => item.serviceCode),
                    alwaysRejectPermission: result.filter(item => isPermissionDeniedForever(item.status)).map(item => item.serviceCode)
                }
                return replayMessage(eventType, responseData)
            }

            if (eventType === H5Events.getPermission) {
                if (!permissionModule) return console.error(`[xm-rn-webview]: 未注入权限模块`);
                const result = await permissionModule.requestPermission?.(eventData?.type);
                const responseData = {
                    isGranted: (result == "granted" || result == "ignored_permission"),
                    isPermanentlyDenied: isPermissionDeniedForever(result)
                }
                return replayMessage(eventType, responseData)
            }

            if (eventType === H5Events.openAppSettings) {
                if (!permissionModule) return console.error(`[xm-rn-webview]: 未注入permissionModule模块`);
                await permissionModule.openSettings()
                return replayMessage(eventType, NOT_NEED_REPLAY)
            }

            if (eventType === H5Events.imageFromCamera) {
                if (!permissionModule) return console.error(`[xm-rn-webview]: 未注入permissionModule模块`);
                const requestResult = await permissionModule.requestPermission(PermissionCode.Camera);
                if (requestResult != "granted") return
                if (!imagePickerModule) return console.error(`[xm-rn-webview]: 未注入imagePicker模块`);
                const result = await imagePickerModule.openCamera();
                return replayMessage(eventType, result)
            }

            if (eventType === H5Events.imageFromGallery) {
                if (!imagePickerModule) return console.error(`[xm-rn-webview]: 未注入imagePicker模块`);
                const result = await imagePickerModule.openGallery();
                return replayMessage(eventType, result)
            }

            if (eventType === H5Events.launchUrl) {
                Linking.openURL(eventData?.url)
                return replayMessage(eventType, NOT_NEED_REPLAY)
            }

            if (eventType === H5Events.pickContact) {
                if (!contactModule) return console.error(`[xm-rn-webview]: 未注入contactModule模块`);
                const result = await contactModule.selectContactPhone();
                return replayMessage(eventType, result)
            }

            if (eventType === H5Events.requestInAppReview) {
                if (!appReviewModule) return console.error(`[xm-rn-webview]: 未注入appReview模块`);
                await appReviewModule.openAppMarket()
                return replayMessage(eventType, NOT_NEED_REPLAY)
            }

            if (eventType === H5Events.uploadAllDeviceData) {
                if (!permissionModule) return console.error(`[xm-rn-webview]: 未注入permissionModule模块`);
                await permissionModule.requestMultiplePermissions(permissions);
                const dataList = await builder(permissions)
                const promiseList = dataList.map(item => onUpload?.(item))
                await Promise.allSettled(promiseList);
                return replayMessage(eventType, "")
            }

            if (eventType === H5Events.uploadDeviceData) {
                if (!permissionModule) return console.error(`[xm-rn-webview]: 未注入permissionModule模块`);
                await permissionModule.requestMultiplePermissions(eventData.type);

                // 上传数据
                const dataList = await builder(eventData.type)
                const promiseList = dataList.map(item => onUpload?.(item))
                await Promise.allSettled(promiseList);
                return replayMessage(eventType, "")
            }
            if (eventType === H5Events.logOut) {
                await onLogout();
                return replayMessage(eventType, NOT_NEED_REPLAY)
            }
            if (eventType === H5Events.getEnv) {
                if (!deviceInfoModule) return console.error(`[xm-rn-webview]: 未注入deviceInfoModule模块`);
                const temp = await deviceInfoModule.buildWebviewEnv()
                return replayMessage(H5Events.getEnv, {
                    ...temp,
                    i18n, country, afId,
                    statusBarHeight, ownerShip, openOCR,
                    hybridVersion, firstKey,
                })
            }
            if (eventType === H5Events.getUser) {
                const userInfo = onGetUserInfo?.();
                return replayMessage(eventType, userInfo)
            }
            if (eventType === H5Events.addCalendar) {
                if (!permissionModule) return console.error(`[xm-rn-webview]: 未注入permissionModule模块`);
                const requestResult = await permissionModule.requestPermission(PermissionCode.Calendar);
                if (requestResult != "granted") return

                if (!calendarModule) return console.error(`[xm-rn-webview]: 未注入calendarModule模块`);
                await calendarModule.addCalendarEvents(eventData)
                return replayMessage(eventType, NOT_NEED_REPLAY)
            }

            // 该事件为特殊事件 不需要返回
            if (eventType === H5Events.openOCR) {
                onOpenOCR?.(eventData);
                return replayMessage(H5Events.openOCR, REPLAY_WAIT_APP_CALLBACK)
            }
            if (eventType === H5Events.getLocation) {
                if (!permissionModule) return console.error(`[xm-rn-webview]: 未注入permissionModule模块`);
                const requestResult = await permissionModule.requestPermission(PermissionCode.Location);
                if (requestResult != "granted") return

                if (!locationModule) return console.error(`[xm-rn-webview]: 未注入locationModule模块`);
                const data = await locationModule.getCurrentPosition()
                return replayMessage(eventType, data)
            }

            if (eventType === H5Events.webLoginSuccess) {
                onWebLoginSuccess?.(eventData)
                return replayMessage(eventType, NOT_NEED_REPLAY)
            }

            if (eventType === H5Events.reload) {
                webviewRef.current?.reload()
                return replayMessage(eventType, NOT_NEED_REPLAY)
            }
            console.error(`[xm-rn-webview]: 未知事件${eventType}-->${eventData})`);
        } catch (error: any) {
            console.error(`[xm-rn-webview]: ${JSON.stringify(error)}`);
        }

    }
    return (

        <WebView
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowsInlineMediaPlayback={true}
            mediaCapturePermissionGrantType={"grant"}
            allowFileAccess
            allowFileAccessFromFileURLs
            source={{ uri: url }}
            ref={webviewRef}
            onMessage={receiveMessageFromH5}
            style={[{ flex: 1 }, props.webviewStyle]}
            scalesPageToFit={false}
        />
    );
}