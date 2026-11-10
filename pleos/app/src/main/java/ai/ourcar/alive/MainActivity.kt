package ai.ourcar.alive

import ai.ourcar.alive.car.DrivingRestriction
import ai.ourcar.alive.store.Store
import ai.ourcar.alive.ui.Actions
import ai.ourcar.alive.ui.AppScreen
import ai.ourcar.alive.ui.OurCarTheme
import ai.ourcar.alive.voice.Voice
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/** 우리 차가 살아있다면 — Pleos Connect 차 안 앱 */
class MainActivity : ComponentActivity() {

    private val model: AppModel by viewModels {
        object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = AppModel(
                source = CarSources.create(applicationContext),
                restriction = DrivingRestriction(applicationContext),
                store = Store(applicationContext),
                voice = Voice(applicationContext),
            ) as T
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            OurCarTheme {
                val ui by model.ui.collectAsStateWithLifecycle()
                AppScreen(ui, Actions(
                    speak = model::speakLine,
                    setLook = model::setLook,
                    setNickname = model::setNickname,
                    dismissDiary = model::dismissDiary,
                ))
            }
        }
    }
}
