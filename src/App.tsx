import React, {useEffect, useRef, useState} from 'react';
import {
  Alert,
  FlatList,
  ListRenderItemInfo,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {BleErrorCode, Device, State, Subscription} from 'react-native-ble-plx';
import BleModule from './BleModule';
import Characteristic from './components/Characteristic';
import Header from './components/Header';
import {alert} from './utils';

const bleModule = new BleModule();

const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [scaning, setScaning] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [connectingId, setConnectingId] = useState('');
  const [writeData, setWriteData] = useState('');
  const [receiveData, setReceiveData] = useState('');
  const [readData, setReadData] = useState('');
  const [inputText, setInputText] = useState('');
  const [data, setData] = useState<Device[]>([]);

  /** receive Bluetooth data cache */
  const bleReceiveData = useRef<any[]>([]);
  /**  Use the Map type to save the searched Bluetooth devices to ensure that the list does not display duplicate devices */
  const deviceMap = useRef(new Map<string, Device>());

  const scanTimer = useRef<number>();
  const disconnectListener = useRef<Subscription>();
  const monitorListener = useRef<Subscription>();

  useEffect(() => {
    // Monitor bluetooth switch
    const stateChangeListener = bleModule.manager.onStateChange(state => {
      console.log('onStateChange: ', state);
      if (state == State.PoweredOn) {
        scan();
      }
    });

    return () => {
      stateChangeListener?.remove();
      disconnectListener.current?.remove();
      monitorListener.current?.remove();
    };
  }, []);

  function scan() {
    setScaning(true);
    deviceMap.current.clear();
    bleModule.manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.log('startDeviceScan error:', error);
        if (error.errorCode === BleErrorCode.BluetoothPoweredOff) {
          enableBluetooth();
        }
        setScaning(false);
      } else if (device) {
        // console.log(device);
        // console.log(device.id, device.name);
        deviceMap.current.set(device.id, device);
        setData([...deviceMap.current.values()]);
      }
    });

    scanTimer.current && clearTimeout(scanTimer.current);
    scanTimer.current = setTimeout(() => {
      bleModule.stopScan();
      setScaning(false);
    }, 3000); // Stop searching after 3 seconds
  }

  function enableBluetooth() {
    if (Platform.OS === 'ios') {
      alert('Please turn on your phone’s Bluetooth');
    } else {
      Alert.alert('Hint', '请开启手机蓝牙', [
        {
          text: 'Cancel',
          onPress: () => {},
        },
        {
          text: 'Enable',
          onPress: () => {
            bleModule.manager.enable();
          },
        },
      ]);
    }
  }

  function connect(item: Device) {
    // Scanning while connecting, stop scanning first
    if (scaning) {
      bleModule.stopScan();
      setScaning(false);
    }
    // Connect
    setConnectingId(item.id);
    bleModule
      .connect(item.id)
      .then(() => {
        // After the connection is successful, the list only displays the connected devices
        setData([item]);
        setIsConnected(true);
        onDisconnect();
      })
      .catch(err => {
        alert('Connection failed');
      })
      .finally(() => {
        setConnectingId('');
      });
  }

  function read(index: number) {
    bleModule
      .read(index)
      .then((value: any) => {
        setReadData(value);
      })
      .catch(err => {});
  }

  function write(writeType: 'write' | 'writeWithoutResponse') {
    return (index: number) => {
      if (inputText.length === 0) {
        alert('Please enter message content');
        return;
      }

      bleModule[writeType](inputText, index)
        .then(() => {
          bleReceiveData.current = [];
          setWriteData(inputText);
          setInputText('');
        })
        .catch(err => {
          alert('Failed to send');
        });
    };
  }

  /** Monitor Bluetooth data */
  function monitor(index: number) {
    monitorListener.current = bleModule.manager.monitorCharacteristicForDevice(
      bleModule.peripheralId,
      bleModule.nofityServiceUUID[index],
      bleModule.nofityCharacteristicUUID[index],
      (error, characteristic) => {
        if (error) {
          setIsMonitoring(false);
          console.log('monitor fail:', error);
          alert('monitor fail: ' + error.reason);
        } else {
          setIsMonitoring(false);
          bleReceiveData.current.push(characteristic!.value); //If the amount of data is large, it will be received in multiple batches.
          setReceiveData(bleReceiveData.current.join(''));
          console.log('monitor success', characteristic!.value);
        }
      },
    );
  }

  /** Monitor Bluetooth disconnection */
  function onDisconnect() {
    disconnectListener.current = bleModule.manager.onDeviceDisconnected(
      bleModule.peripheralId,
      (error, device) => {
        if (error) {
          // Bluetooth automatically disconnects when encountering an error
          console.log('device disconnect', error);
          initData();
        } else {
          disconnectListener.current?.remove();
          console.log('device disconnect', device!.id, device!.name);
        }
      },
    );
  }

  /** Disconnect Bluetooth */
  function disconnect() {
    bleModule.disconnect();
    initData();
  }

  function initData() {
    // Clear UUID after disconnection
    bleModule.initUUID();
    // Display the last scan results after disconnection
    setData([...deviceMap.current.values()]);
    setIsConnected(false);
    setWriteData('');
    setReadData('');
    setReceiveData('');
    setInputText('');
  }

  function renderItem(item: ListRenderItemInfo<Device>) {
    const data = item.item;
    const disabled = !!connectingId && connectingId !== data.id;
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        disabled={disabled || isConnected}
        onPress={() => {
          connect(data);
        }}
        style={[styles.item, {opacity: disabled ? 0.5 : 1}]}>
        <View style={{flexDirection: 'row'}}>
          <Text style={{color: 'black'}}>{data.name ? data.name : ''}</Text>
          <Text style={{marginLeft: 50, color: 'red'}}>
            {connectingId === data.id ? 'connecting...' : ''}
          </Text>
        </View>
        <Text>{data.id}</Text>
      </TouchableOpacity>
    );
  }

  function renderFooter() {
    if (!isConnected) {
      return;
    }
    return (
      <ScrollView
        style={{
          marginTop: 10,
          borderColor: '#eee',
          borderStyle: 'solid',
          borderTopWidth: StyleSheet.hairlineWidth * 2,
        }}>
        <Characteristic
          label="Write"
          action="send"
          content={writeData}
          characteristics={bleModule.writeWithResponseCharacteristicUUID}
          onPress={write('write')}
          input={{inputText, setInputText}}
        />

        <Characteristic
          label="WriteWithoutResponse"
          action="send"
          content={writeData}
          characteristics={bleModule.writeWithoutResponseCharacteristicUUID}
          onPress={write('writeWithoutResponse')}
          input={{inputText, setInputText}}
        />

        <Characteristic
          label="Read data"
          action="read"
          content={readData}
          characteristics={bleModule.readCharacteristicUUID}
          onPress={read}
        />

        <Characteristic
          label={`Notification monitoring received data（${
            isMonitoring ? 'Monitoring is on' : 'Monitoring is not enabled'
          }）：`}
          action="Turn on Monitoring"
          content={receiveData}
          characteristics={bleModule.nofityCharacteristicUUID}
          onPress={monitor}
        />
      </ScrollView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header
        isConnected={isConnected}
        scaning={scaning}
        disabled={scaning || !!connectingId}
        onPress={isConnected ? disconnect : scan}
      />
      <FlatList
        renderItem={renderItem}
        keyExtractor={item => item.id}
        data={data}
        extraData={connectingId}
      />
      {renderFooter()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  item: {
    flexDirection: 'column',
    borderColor: 'rgb(235,235,235)',
    borderStyle: 'solid',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingLeft: 10,
    paddingVertical: 8,
  },
});

export default App;
