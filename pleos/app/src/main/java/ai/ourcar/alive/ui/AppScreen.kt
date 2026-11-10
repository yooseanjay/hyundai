package ai.ourcar.alive.ui

import ai.ourcar.alive.UiState
import ai.ourcar.alive.logic.DiaryEntry
import ai.ourcar.alive.logic.Mood
import ai.ourcar.alive.store.Look
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

enum class Page(val label: String) { HOME("홈"), DIARY("일기"), STYLE("꾸미기") }

class Actions(
    val speak: () -> Unit,
    val setLook: (Look) -> Unit,
    val setNickname: (String) -> Unit,
    val dismissDiary: () -> Unit,
)

/** 가로 화면(넓은 창)이면 2열 · 왼쪽 메뉴, 세로면 위쪽 탭 (아래쪽은 Pleos 시스템 바 자리) */
@Composable
fun AppScreen(ui: UiState, act: Actions) {
    var page by rememberSaveable { mutableStateOf(Page.HOME) }
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        BoxWithConstraints(Modifier.fillMaxSize().safeDrawingPadding()) {
            val wide = maxWidth > maxHeight && maxWidth >= 840.dp
            when {
                !ui.car.connected || ui.status == null -> Connecting(ui)
                // 주행 중 화면 제한: 큰 얼굴 + 주행 가능 거리만 (메뉴 · 목록 · 입력 없음)
                ui.restricted -> DrivingScreen(ui, wide)
                wide -> Row(Modifier.fillMaxSize()) {
                    NavigationRail(Modifier.padding(vertical = 16.dp)) {
                        Page.entries.forEach { p ->
                            NavigationRailItem(
                                selected = page == p, onClick = { page = p },
                                icon = { Icon(p.icon(), contentDescription = null) },
                                label = { Text(p.label, style = MaterialTheme.typography.labelMedium) },
                            )
                        }
                    }
                    Box(Modifier.weight(1f)) { PageContent(page, ui, act, wide = true) }
                }
                else -> Column(Modifier.fillMaxSize()) {
                    TabRow(selectedTabIndex = page.ordinal) {
                        Page.entries.forEach { p ->
                            Tab(selected = page == p, onClick = { page = p }, modifier = Modifier.padding(vertical = 8.dp),
                                icon = { Icon(p.icon(), contentDescription = null) },
                                text = { Text(p.label, style = MaterialTheme.typography.labelLarge) })
                        }
                    }
                    Box(Modifier.weight(1f)) { PageContent(page, ui, act, wide = false) }
                }
            }
        }
        ui.freshDiary?.takeIf { !ui.restricted }?.let { FreshDiary(it, act.dismissDiary) }
    }
}

@Composable
private fun PageContent(page: Page, ui: UiState, act: Actions, wide: Boolean) = when (page) {
    Page.HOME -> HomeScreen(ui, act, wide)
    Page.DIARY -> DiaryScreen(ui, wide)
    Page.STYLE -> StyleScreen(ui, act, wide)
}

@Composable
private fun Connecting(ui: UiState) {
    Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.weight(1f))
        Face(Mood.SLEEPY, ui.look, Modifier.fillMaxWidth(0.6f))
        Spacer(Modifier.padding(16.dp))
        Text("차랑 연결하는 중이에요", style = MaterialTheme.typography.headlineMedium)
        Text("시동을 켠 Pleos Connect 차에서 열어 주세요.", style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        Spacer(Modifier.weight(1f))
    }
}

@Composable
private fun FreshDiary(d: DiaryEntry, onClose: () -> Unit) {
    AlertDialog(
        onDismissRequest = onClose,
        confirmButton = { TextButton(onClick = onClose) { Text("일기장에 붙이기", style = MaterialTheme.typography.labelLarge) } },
        title = { Text("오늘의 일기 · ${d.title}", style = MaterialTheme.typography.titleLarge) },
        text = { Text(d.body, style = MaterialTheme.typography.bodyLarge) },
    )
}

/** 주행 중: 움직임 없는 큰 얼굴 + 한마디 + 주행 가능 거리. 누를 것 없음 */
@Composable
private fun DrivingScreen(ui: UiState, wide: Boolean) {
    val st = ui.status ?: return
    val body: @Composable () -> Unit = {
        Text(st.line, style = MaterialTheme.typography.headlineMedium, maxLines = 2)
        Text("주행 가능 ${ui.car.rangeKm ?: "-"}km · ${if (ui.car.isEv) "배터리" else "연료"} ${st.energy}%",
            style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    if (wide) Row(Modifier.fillMaxSize().padding(32.dp), verticalAlignment = Alignment.CenterVertically) {
        Face(st.mood, ui.look, Modifier.weight(1.2f))
        Spacer(Modifier.width(40.dp))
        Column(Modifier.weight(1f)) { body() }
    } else Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center) {
        Face(st.mood, ui.look, Modifier.fillMaxWidth())
        Spacer(Modifier.padding(16.dp))
        body()
    }
}
