package ai.ourcar.alive.ui

import ai.ourcar.alive.R
import ai.ourcar.alive.UiState
import ai.ourcar.alive.car.Warning
import ai.ourcar.alive.store.EyeStyle
import ai.ourcar.alive.store.Glow
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Warning as WarnIcon
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

fun Page.icon(): ImageVector = when (this) {
    Page.HOME -> Icons.Filled.Home
    Page.DIARY -> Icons.Filled.DateRange
    Page.STYLE -> Icons.Filled.Face
}

private val num = NumberFormat.getIntegerInstance(Locale.KOREA)

/** 가로면 [left] | [right] 2열, 세로면 위아래로 이어서 스크롤 */
@Composable
private fun TwoPane(wide: Boolean, left: @Composable ColumnScope.() -> Unit, right: @Composable ColumnScope.() -> Unit) {
    if (wide) Row(Modifier.fillMaxSize().padding(24.dp), horizontalArrangement = Arrangement.spacedBy(32.dp)) {
        Column(Modifier.weight(1.1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp), content = left)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp), content = right)
    } else Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        left()
        right()
    }
}

@Composable
private fun Panel(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) = Card(
    modifier.fillMaxWidth(),
    shape = RoundedCornerShape(24.dp),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
) { Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content) }

// ───────── 홈 ─────────

@Composable
fun HomeScreen(ui: UiState, act: Actions, wide: Boolean) {
    val st = ui.status ?: return
    val car = ui.car
    TwoPane(wide, left = {
        Text(ui.nickname, style = MaterialTheme.typography.headlineLarge)
        Face(st.mood, ui.look, Modifier.fillMaxWidth())
        // 한마디: 누르면 캐릭터가 읽어 줌 (Pleos TTS)
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceVariant)
                .clickable(role = Role.Button, onClickLabel = "말 듣기", onClick = act.speak).heightIn(min = 72.dp).padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(st.line, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            Icon(Icons.Filled.PlayArrow, contentDescription = "말 듣기", modifier = Modifier.size(36.dp))
        }
    }, right = {
        Panel {
            Text("주행 가능 거리", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(verticalAlignment = Alignment.Bottom) {
                Text("${car.rangeKm ?: "-"}", style = MaterialTheme.typography.headlineLarge)
                Text(" km", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 6.dp))
                Spacer(Modifier.weight(1f))
                Text("${if (car.isEv) "배터리" else "연료"} ${st.energy}%${if (car.charging) " · 충전 중" else ""}",
                    style = MaterialTheme.typography.titleMedium)
            }
            LinearProgressIndicator(
                progress = { st.energy / 100f },
                modifier = Modifier.fillMaxWidth().height(10.dp).clip(CircleShape),
                color = if (st.energy < 20) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
            )
            car.odometerKm?.let {
                Text("누적 ${num.format(it.toLong())}km", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (car.warnings.isEmpty()) Panel {
            Text("돌봐 줄 곳 없음", style = MaterialTheme.typography.titleMedium)
            Text("엔진오일 · 브레이크액 · 워셔액 모두 괜찮아요", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else car.warnings.forEach { WarningCard(it) }
        ui.diaries.firstOrNull()?.let { d ->
            Panel {
                Text("최근 일기 · ${dateText(d.date)}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(d.title, style = MaterialTheme.typography.titleMedium)
                Text(d.body, style = MaterialTheme.typography.bodyMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
        }
    })
}

@Composable
private fun WarningCard(w: Warning) = Card(
    Modifier.fillMaxWidth(), shape = RoundedCornerShape(24.dp),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer, contentColor = MaterialTheme.colorScheme.onErrorContainer),
) {
    Row(Modifier.padding(24.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.WarnIcon, contentDescription = null, modifier = Modifier.size(36.dp))
        Spacer(Modifier.width(16.dp))
        Column {
            Text("${w.label}을 확인해 주세요", style = MaterialTheme.typography.titleMedium)
            Text(w.hint, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

// ───────── 일기 ─────────

@Composable
fun DiaryScreen(ui: UiState, wide: Boolean) {
    val totalKm = ui.diaries.sumOf { it.distanceKm }
    if (ui.diaries.isEmpty()) {
        Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text("아직 일기가 없어요", style = MaterialTheme.typography.headlineMedium)
            Text("P에서 출발해 다시 P에 세우면 그날의 일기가 생겨요.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    LazyVerticalGrid(
        columns = GridCells.Fixed(if (wide) 2 else 1),
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(24.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
            Text("${ui.nickname}의 일기 · ${ui.diaries.size}편 · ${"%.1f".format(totalKm)}km", style = MaterialTheme.typography.headlineMedium)
        }
        items(ui.diaries, key = { it.id }) { d ->
            Panel {
                Text("${dateText(d.date)} · ${d.distanceKm}km · ${d.durationMin}분", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(d.title, style = MaterialTheme.typography.titleMedium)
                Text(d.body, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

private val dateFmt = DateTimeFormatter.ofPattern("M월 d일 (E) HH:mm", Locale.KOREAN)
private fun dateText(ms: Long) = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()).format(dateFmt)

// ───────── 꾸미기 ─────────

@Composable
fun StyleScreen(ui: UiState, act: Actions, wide: Boolean) {
    val look = ui.look
    TwoPane(wide, left = {
        Box(Modifier.fillMaxWidth()) {
            Image(painterResource(R.drawable.car_front), contentDescription = "내 차", contentScale = ContentScale.FillWidth, modifier = Modifier.fillMaxWidth())
        }
        Face(ai.ourcar.alive.logic.Mood.HAPPY, look, Modifier.fillMaxWidth())
    }, right = {
        Text("눈 모양", style = MaterialTheme.typography.titleMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            EyeStyle.entries.forEach { e ->
                FilterChip(selected = look.eye == e, onClick = { act.setLook(look.copy(eye = e)) },
                    label = { Text(e.label, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(vertical = 12.dp)) })
            }
        }
        Text("얼굴 빛", style = MaterialTheme.typography.titleMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Glow.entries.forEach { g ->
                val on = look.glow == g
                Box(
                    Modifier.size(56.dp).clip(CircleShape).background(Color(g.argb))
                        .border(BorderStroke(if (on) 4.dp else 1.dp, if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline), CircleShape)
                        .clickable(role = Role.RadioButton, onClickLabel = g.label) { act.setLook(look.copy(glow = g)) },
                )
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("볼터치", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            Switch(checked = look.blush, onCheckedChange = { act.setLook(look.copy(blush = it)) })
        }
        Text("이름", style = MaterialTheme.typography.titleMedium)
        var name by remember(ui.nickname) { mutableStateOf(ui.nickname) }
        val focus = LocalFocusManager.current
        OutlinedTextField(
            value = name, onValueChange = { name = it.take(12) }, singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge, modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { act.setNickname(name); focus.clearFocus() }),
        )
        Text("기록은 이 차 안에만 저장돼요.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    })
}
