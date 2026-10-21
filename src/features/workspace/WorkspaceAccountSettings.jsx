import { Icon } from "../../components/v2/primitives.jsx";
import { DeveloperEnvironmentControls } from "../../components/EnvironmentBanner.jsx";
import { NotificationControl } from "../notifications/NotificationControl.jsx";
import { FeedbackPanel } from "../feedback/FeedbackPanel.jsx";
import { WhatsNewPanel } from "../releases/WhatsNewPanel.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { useTheme } from "../../theme/theme.js";
import { appVersion } from "../../appVersion.js";
import { settingsText } from "./workspaceSettingsMessages.js";
// Presentation only, mounted exclusively by the existing authorized V3 boundary.
export default function WorkspaceAccountSettings({user,screen,identity,languageControl,signOutControl,signOutError,onExit,advancedNavigation}) {
 const{language,translate}=useTranslation();const{preference,setTheme}=useTheme();const t=key=>settingsText(language,key);
 const section=(key,icon,content)=><section className="workspace-settings-section" aria-labelledby={`workspace-settings-${key}`}><h3 id={`workspace-settings-${key}`}><Icon name={icon}/>{t(key)}</h3>{content}</section>;
 return <div className="workspace-settings">
  {section("account","user",<><div className="workspace-settings-account">{identity}{signOutControl}</div>{signOutError}</>)}
  {section("preferences","tools",<div className="workspace-settings-preferences"><label><span>{translate("common.language")}</span><span className="workspace-settings-select">{languageControl}<Icon name="chevron"/></span></label><label><span>{t("appearance")}</span><span className="workspace-settings-select"><select aria-label={t("appearance")} value={preference} onChange={event=>setTheme(event.target.value)}>{["light","dark","system"].map(value=><option key={value} value={value}>{t(value)}</option>)}</select><Icon name="chevron"/></span></label></div>)}
  {section("notifications","info",<><NotificationControl userId={user.uid} detailLabels={t}/><p className="workspace-settings-note">{t("notificationNote")}</p></>)}
  {section("help","info",<div className="workspace-settings-help"><FeedbackPanel screen={screen}/><WhatsNewPanel/></div>)}
  <details className="workspace-settings-advanced"><summary><Icon name="flask"/>{t("advanced")}<Icon name="chevron"/></summary><div><DeveloperEnvironmentControls user={user}/><p>{appVersion}</p>{advancedNavigation}<button className="cfv2-button cfv2-button-secondary" onClick={onExit} type="button">{t("exit")}</button></div></details>
 </div>;
}
